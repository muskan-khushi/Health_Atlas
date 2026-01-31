import os
import json
import uuid
import asyncio
import pandas as pd
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from asyncio import Queue
from typing import Dict, Any, List, Optional
from datetime import datetime
import shutil
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor

from fastapi import WebSocket, WebSocketDisconnect

from agent import app as validation_agent_app
from tools import parse_provider_pdf

app = FastAPI(title="Health Atlas Provider Validator v2.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        
        for connection in disconnected:
            self.disconnect(connection)


manager = ConnectionManager()


@app.websocket("/ws/analytics")
async def websocket_analytics(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(5)
            stats = await get_dashboard_stats()
            await websocket.send_json(stats)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "2.1"}


MAX_CONCURRENT_WORKERS = 5


def get_db_connection():
    """Get database connection with error handling."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is not set")
    return psycopg2.connect(database_url)


def normalize_provider_data(provider_info: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize provider data to match AgentState initial_data schema."""
    return {
        "full_name": provider_info.get("full_name") or provider_info.get("fullName", ""),
        "NPI": provider_info.get("NPI") or provider_info.get("npi", ""),
        "address": provider_info.get("address", ""),
        "city": provider_info.get("city", ""),
        "state": provider_info.get("state", ""),
        "zip_code": provider_info.get("zip_code") or provider_info.get("zipCode", ""),
        "website": provider_info.get("website", ""),
        "specialty": provider_info.get("specialty", ""),
        "phone": provider_info.get("phone", ""),
        "license_number": provider_info.get("license_number") or provider_info.get("license", ""),
        "last_updated": provider_info.get("last_updated") or provider_info.get("lastUpdated", "2024-01-01")
    }


def format_result_for_frontend(final_result: Dict[str, Any], provider_info: Dict[str, Any]) -> Dict[str, Any]:
    """Format agent result to EXACTLY match frontend expectations."""
    quality_metrics = final_result.get("quality_metrics", {})
    score_breakdown = quality_metrics.get("score_breakdown", {})
    dimension_percentages = quality_metrics.get("dimension_percentages", {})

    if not score_breakdown:
        score_breakdown = {
            "identity": 0.0,
            "address": 0.0,
            "completeness": 0.0,
            "freshness": 0.0,
            "enrichment": 0.0,
            "risk": 0.0
        }
    
    if not dimension_percentages:
        dimension_percentages = {
            k: f"{int(v * 100)}%" for k, v in score_breakdown.items()
        }
        dimension_percentages["risk_penalty"] = dimension_percentages.pop("risk", "0%")

    tier = quality_metrics.get("confidence_tier", "UNKNOWN")
    tier_emoji = {
        "PLATINUM": "🟢",
        "GOLD": "🟡",
        "QUESTIONABLE": "🔴"
    }.get(tier, "📊")

    return {
        "original_data": provider_info,
        "final_profile": final_result.get("final_profile") or final_result.get("golden_record") or {
            "provider_name": provider_info.get("full_name", "Unknown Provider"),
            "npi": provider_info.get("NPI", "N/A"),
            "specialty": provider_info.get("specialty", "N/A"),
        },
        "confidence_score": final_result.get("confidence_score", 0),
        "requires_human_review": final_result.get("requires_human_review", False),
        "review_reason": final_result.get("review_reason", ""),
        "path": quality_metrics.get("path", "UNKNOWN"),
        "qa_flags": final_result.get("qa_flags", []),
        "fraud_indicators": final_result.get("fraud_indicators", []),
        "qa_corrections": final_result.get("qa_corrections", {}),
        "quality_metrics": {
            **quality_metrics,
            "score_breakdown": score_breakdown,
            "dimension_percentages": dimension_percentages,
            "confidence_tier": tier,
            "tier_emoji": tier_emoji,
            "tier_description": quality_metrics.get("tier_description", ""),
            "flag_severity": quality_metrics.get("flag_severity", {}),
            "risk_score": quality_metrics.get("risk_score", 0),
            "fraud_indicator_count": quality_metrics.get("fraud_indicator_count", 0),
            "conflict_count": quality_metrics.get("conflict_count", 0),
        },
        "execution_metadata": final_result.get("execution_metadata", {}),
        "verification_status": {
            "nppes_verified": bool(final_result.get("npi_result", {}).get("result_count", 0)),
            "oig_clear": not final_result.get("oig_leie_result", {}).get("is_excluded", False),
            "license_active": final_result.get("state_board_result", {}).get("status") == "Active",
            "address_validated": final_result.get("address_result", {}).get("is_medical_facility", False),
            "digital_footprint_score": final_result.get("digital_footprint_score", 0),
        }
    }


@app.post("/validate-file")
async def validate_file(file: UploadFile = File(...)):
    """Enhanced API endpoint with parallel processing and streaming results."""
    temp_filename = f"temp_{uuid.uuid4()}_{file.filename}"

    async def file_processor_stream():
        result_queue = Queue()
        
        try:
            with open(temp_filename, "wb") as buffer:
                buffer.write(await file.read())

            provider_list = []
            
            if file.filename.endswith('.csv'):
                yield f"data: {json.dumps({'type': 'log', 'content': '📄 Reading CSV file...'})}\n\n"
                df = pd.read_csv(temp_filename, dtype=str).fillna("")
                provider_list = df.to_dict(orient='records')
            
            elif file.filename.endswith('.pdf'):
                yield f"data: {json.dumps({'type': 'log', 'content': '🔍 Parsing PDF with Vision AI...'})}\n\n"
                provider_list = parse_provider_pdf(temp_filename)
                if provider_list and isinstance(provider_list[0], dict) and provider_list[0].get("error"):
                    error_msg = provider_list[0]["error"]
                    yield f"data: {json.dumps({'type': 'log', 'content': f'❌ PDF Error: {error_msg}'})}\n\n"
                    provider_list = []
            else:
                yield f"data: {json.dumps({'type': 'log', 'content': '❌ Unsupported file format'})}\n\n"
                return

            total_records = len(provider_list)
            if total_records == 0:
                yield f"data: {json.dumps({'type': 'log', 'content': '❌ No records found in file'})}\n\n"
                return
                
            yield f"data: {json.dumps({'type': 'log', 'content': f'🚀 Found {total_records} records. Processing...'})}\n\n"
            await asyncio.sleep(0)

            async def worker(provider_info, index):
                try:
                    provider_name = provider_info.get('full_name') or provider_info.get('fullName', f'Record {index + 1}')
                    await result_queue.put(('log', f"🔄 [{index + 1}/{total_records}] Processing: {provider_name}"))
                    
                    normalized_data = normalize_provider_data(provider_info)
                    
                    initial_state = {
                        "initial_data": normalized_data,
                        "log": [],
                        "npi_result": {},
                        "oig_leie_result": {},
                        "state_board_result": {},
                        "address_result": {},
                        "web_enrichment_data": {},
                        "digital_footprint_score": 0.0,
                        "qa_flags": [],
                        "qa_corrections": {},
                        "fraud_indicators": [],
                        "conflicting_data": [],
                        "golden_record": {},
                        "confidence_score": 0.0,
                        "confidence_breakdown": {},
                        "requires_human_review": False,
                        "review_reason": "",
                        "final_profile": {},
                        "execution_metadata": {},
                        "data_provenance": {},
                        "quality_metrics": {}
                    }

                    final_result = await asyncio.to_thread(validation_agent_app.invoke, initial_state)
                    result_payload = format_result_for_frontend(final_result, provider_info)
                    
                    path = result_payload.get("path", "UNKNOWN")
                    path_emoji = "🟢" if path == "GREEN" else "🟡" if path == "YELLOW" else "🔴"
                    confidence = result_payload.get("confidence_score", 0)
                    
                    completion_msg = f"{path_emoji} [{index + 1}/{total_records}] {provider_name} - {path} PATH ({confidence:.1%})"
                    await result_queue.put(('log', completion_msg))
                    await result_queue.put(('result', result_payload))
                    
                except Exception as e:
                    error_msg = f"❌ Error processing record {index + 1}: {str(e)}"
                    await result_queue.put(('log', error_msg))
                    await result_queue.put(('result', {
                        "original_data": provider_info,
                        "error": str(e),
                        "confidence_score": 0,
                        "path": "ERROR",
                        "requires_human_review": True,
                        "review_reason": f"Processing error: {str(e)}"
                    }))

            semaphore = asyncio.Semaphore(MAX_CONCURRENT_WORKERS)
            
            async def bounded_worker(provider_info, index):
                async with semaphore:
                    await worker(provider_info, index)
            
            tasks = [
                asyncio.create_task(bounded_worker(provider, i))
                for i, provider in enumerate(provider_list)
            ]
            
            completed = 0
            while completed < total_records:
                try:
                    result_type, result_data = await asyncio.wait_for(result_queue.get(), timeout=2.0)
                    
                    if result_type == 'log':
                        yield f"data: {json.dumps({'type': 'log', 'content': result_data})}\n\n"
                    elif result_type == 'result':
                        yield f"data: {json.dumps({'type': 'result', 'data': result_data})}\n\n"
                        completed += 1
                        
                except asyncio.TimeoutError:
                    if all(task.done() for task in tasks):
                        break
                    continue
            
            await asyncio.gather(*tasks, return_exceptions=True)
            
            while not result_queue.empty():
                try:
                    result_type, result_data = result_queue.get_nowait()
                    if result_type == 'log':
                        yield f"data: {json.dumps({'type': 'log', 'content': result_data})}\n\n"
                    elif result_type == 'result':
                        yield f"data: {json.dumps({'type': 'result', 'data': result_data})}\n\n"
                except Exception:
                    break
            
            yield f"data: {json.dumps({'type': 'log', 'content': f'✅ Complete! {total_records} records validated.'})}\n\n"

        except Exception as e:
            error_msg = f"❌ Critical error: {type(e).__name__}: {str(e)}"
            print(error_msg)
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'log', 'content': error_msg})}\n\n"
        finally:
            if os.path.exists(temp_filename):
                try:
                    os.remove(temp_filename)
                except Exception as e:
                    print(f"Warning: Could not remove temp file: {e}")
            yield f"data: {json.dumps({'type': 'close', 'content': 'Stream closed.'})}\n\n"

    return StreamingResponse(file_processor_stream(), media_type="text/event-stream")


@app.post("/validate-single")
async def validate_single_provider(provider_data: Dict[str, Any]):
    """Validate a single provider."""
    try:
        normalized_data = normalize_provider_data(provider_data)
        
        initial_state = {
            "initial_data": normalized_data,
            "log": [],
            "npi_result": {},
            "oig_leie_result": {},
            "state_board_result": {},
            "address_result": {},
            "web_enrichment_data": {},
            "digital_footprint_score": 0.0,
            "qa_flags": [],
            "qa_corrections": {},
            "fraud_indicators": [],
            "conflicting_data": [],
            "golden_record": {},
            "confidence_score": 0.0,
            "confidence_breakdown": {},
            "requires_human_review": False,
            "review_reason": "",
            "final_profile": {},
            "execution_metadata": {},
            "data_provenance": {},
            "quality_metrics": {}
        }
        
        final_result = validation_agent_app.invoke(initial_state)
        result_payload = format_result_for_frontend(final_result, provider_data)
        
        return {"status": "success", "data": result_payload}
        
    except Exception as e:
        print(f"Error in validate_single_provider: {e}")
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "error": str(e),
            "data": {
                "original_data": provider_data,
                "confidence_score": 0,
                "path": "ERROR",
                "requires_human_review": True,
                "review_reason": f"Processing error: {str(e)}"
            }
        }


@app.post("/api/providers/apply")
async def apply_provider(
    fullName: str = Form(...),
    email: str = Form(...),
    phoneNumber: str = Form(...),
    speciality: str = Form(...),
    licenseNumber: str = Form(...),
    npiId: str = Form(...),
    practiceAddress: str = Form(...),
    aiRawResult: str = Form(...),
    aiParsedResult: str = Form(...),
    file: UploadFile = File(...)
):
    """Handle provider application submissions."""
    try:
        UPLOAD_DIR = Path("provider_applications")
        UPLOAD_DIR.mkdir(exist_ok=True)
        
        application_id = f"APP_{uuid.uuid4().hex[:8].upper()}"
        
        file_extension = Path(file.filename).suffix
        saved_filename = f"{application_id}_{fullName.replace(' ', '_')}{file_extension}"
        file_path = UPLOAD_DIR / saved_filename
        
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        try:
            ai_raw = json.loads(aiRawResult)
            ai_parsed = json.loads(aiParsedResult)
        except json.JSONDecodeError:
            ai_raw = {"raw_data": aiRawResult}
            ai_parsed = {"parsed_data": aiParsedResult}
        
        confidence_score = ai_parsed.get("confidence_score", 0)
        path = ai_parsed.get("path", "UNKNOWN")
        requires_review = ai_parsed.get("requires_human_review", False)
        fraud_indicators = ai_parsed.get("fraud_indicators", [])
        qa_flags = ai_parsed.get("qa_flags", [])
        
        if path == "GREEN" and confidence_score >= 0.7 and not requires_review:
            status = "approved"
        elif path == "YELLOW" or (confidence_score >= 0.4 and confidence_score < 0.7):
            status = "pending_review"
        else:
            status = "flagged_for_review"
        
        application_data = {
            "application_id": application_id,
            "submission_date": datetime.now().isoformat(),
            "status": status,
            "provider_info": {
                "full_name": fullName,
                "email": email,
                "phone": phoneNumber,
                "specialty": speciality,
                "license_number": licenseNumber,
                "npi": npiId,
                "practice_address": practiceAddress
            },
            "ai_validation": {
                "confidence_score": confidence_score,
                "path": path,
                "requires_review": requires_review,
                "fraud_indicators": fraud_indicators,
                "qa_flags": qa_flags,
                "raw_result": ai_raw,
                "parsed_result": ai_parsed
            },
            "uploaded_file": {
                "original_name": file.filename,
                "saved_name": saved_filename,
                "path": str(file_path),
                "size_bytes": file_path.stat().st_size
            }
        }
        
        applications_file = Path("provider_applications.json")
        applications = []
        
        if applications_file.exists():
            try:
                with applications_file.open("r") as f:
                    applications = json.load(f)
            except json.JSONDecodeError:
                applications = []
        
        applications.append(application_data)
        
        with applications_file.open("w") as f:
            json.dump(applications, f, indent=2)
        
        print(f"✅ Application {application_id} saved for {fullName}")
        print(f"   Status: {status} | Confidence: {confidence_score:.1%} | Path: {path}")
        
        return {
            "success": True,
            "message": "Application submitted successfully",
            "application_id": application_id,
            "status": status,
            "validation_summary": {
                "confidence_score": confidence_score,
                "path": path,
                "requires_review": requires_review,
                "fraud_indicators_count": len(fraud_indicators),
                "qa_flags_count": len(qa_flags)
            },
            "next_steps": (
                "Your application has been approved and will be added to our network."
                if status == "approved" else
                "Your application is under review. We will contact you within 2-3 business days."
            )
        }
        
    except Exception as e:
        print(f"❌ Error saving application: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return {
            "success": False,
            "message": f"Failed to save application: {str(e)}",
            "error": str(e)
        }


@app.get("/api/analytics/providers-geolocation")
async def get_providers_geolocation():
    """Returns provider locations for 3D globe visualization."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # FIXED: Use confidence_tier instead of tier
        cursor.execute("""
            SELECT 
                id,
                provider_name,
                npi,
                city,
                state,
                zip_code,
                confidence_score,
                confidence_tier,
                validation_metadata,
                created_at
            FROM validated_providers
            WHERE state IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 500
        """)
        
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        state_coords = {
            "CA": {"lat": 36.7783, "lon": -119.4179},
            "TX": {"lat": 31.9686, "lon": -99.9018},
            "FL": {"lat": 27.6648, "lon": -81.5158},
            "NY": {"lat": 42.1657, "lon": -74.9481},
            "IL": {"lat": 40.6331, "lon": -89.3985},
            "PA": {"lat": 41.2033, "lon": -77.1945},
            "OH": {"lat": 40.4173, "lon": -82.9071},
            "MA": {"lat": 42.4072, "lon": -71.3824},
            "WA": {"lat": 47.7511, "lon": -120.7401},
            "CO": {"lat": 39.5501, "lon": -105.7821},
            "AZ": {"lat": 34.0489, "lon": -111.0937},
            "MI": {"lat": 44.3148, "lon": -85.6024},
            "GA": {"lat": 32.1656, "lon": -82.9001},
            "NC": {"lat": 35.7596, "lon": -79.0193},
            "NJ": {"lat": 40.0583, "lon": -74.4057},
        }
        
        providers = []
        for row in rows:
            state = row['state']
            coords = state_coords.get(state, {"lat": 39.8283, "lon": -98.5795})
            
            # Get tier from confidence_tier column
            tier = row['confidence_tier'] or "UNKNOWN"
            
            # Determine status color based on tier
            if tier == "PLATINUM":
                status = "green"
            elif tier == "GOLD":
                status = "yellow"
            else:
                status = "red"
            
            # Extract validation_path from metadata
            validation_metadata = row['validation_metadata'] or {}
            quality_metrics = validation_metadata.get('quality_metrics', {})
            path = quality_metrics.get('path', 'UNKNOWN')
            
            providers.append({
                "id": row['id'],
                "name": row['provider_name'],
                "npi": row['npi'],
                "city": row['city'],
                "state": state,
                "zip_code": row['zip_code'],
                "lat": coords["lat"] + (hash(str(row['id'])) % 1000 - 500) / 100,
                "lon": coords["lon"] + (hash(str(row['id']) + "lon") % 1000 - 500) / 100,
                "confidence": row['confidence_score'],
                "status": status,
                "tier": tier,
                "path": path,
                "validated_at": row['created_at'].isoformat() if row['created_at'] else None
            })
        
        return {
            "success": True,
            "providers": providers,
            "total": len(providers),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error fetching geolocation data: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "providers": []
        }


@app.get("/api/analytics/validation-heatmap")
async def get_validation_heatmap():
    """Returns real-time validation stage data for heatmap."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get recent validations with their execution metadata
        cursor.execute("""
            SELECT 
                id,
                provider_name,
                npi,
                validation_metadata,
                created_at
            FROM validated_providers
            WHERE created_at >= NOW() - INTERVAL '24 hours'
            ORDER BY created_at DESC
            LIMIT 50
        """)
        
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        providers = []
        for row in rows:
            validation_metadata = row['validation_metadata'] if row['validation_metadata'] else {}
            execution_meta = validation_metadata.get('execution_metadata', {})
            
            # Extract stage statuses from execution metadata
            stages = {
                "vlm": execution_meta.get("vlm", {}).get("status", "pending"),
                "npi": execution_meta.get("nppes", {}).get("status", "pending"),
                "oig": execution_meta.get("oig_leie", {}).get("status", "pending"),
                "license": execution_meta.get("state_board", {}).get("status", "pending"),
                "address": execution_meta.get("address", {}).get("status", "pending"),
                "web": execution_meta.get("web_enrichment", {}).get("status", "pending"),
                "score": "complete"
            }
            
            # Extract confidence scores per stage
            stage_scores = {
                "npi": execution_meta.get("nppes", {}).get("match_confidence", 0),
                "address": execution_meta.get("address", {}).get("confidence", 0),
                "web": execution_meta.get("web_enrichment", {}).get("digital_footprint_score", 0)
            }
            
            providers.append({
                "id": row['id'],
                "name": row['provider_name'],
                "npi": row['npi'],
                "stages": stages,
                "stage_scores": stage_scores,
                "validated_at": row['created_at'].isoformat() if row['created_at'] else None
            })
        
        return {
            "success": True,
            "providers": providers,
            "total": len(providers),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error fetching heatmap data: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "providers": []
        }


@app.get("/api/analytics/confidence-breakdown")
async def get_confidence_breakdown():
    """Returns confidence score breakdowns for radar chart."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # FIXED: Use confidence_tier instead of tier
        cursor.execute("""
            SELECT 
                id,
                provider_name,
                npi,
                confidence_score,
                confidence_tier,
                validation_metadata,
                created_at
            FROM validated_providers
            ORDER BY created_at DESC
            LIMIT 10
        """)
        
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        providers = []
        for row in rows:
            validation_metadata = row['validation_metadata'] if row['validation_metadata'] else {}
            quality_metrics = validation_metadata.get('quality_metrics', {})
            score_breakdown = quality_metrics.get("score_breakdown", {})
            
            # Extract 6-dimensional scores
            dimensions = [
                {
                    "dimension": "Primary\nSource",
                    "score": int(score_breakdown.get("identity", 0) * 100),
                    "max": 100,
                    "weight": 35
                },
                {
                    "dimension": "Address\nReliability",
                    "score": int(score_breakdown.get("address", 0) * 100),
                    "max": 100,
                    "weight": 20
                },
                {
                    "dimension": "Digital\nFootprint",
                    "score": int(score_breakdown.get("enrichment", 0) * 100),
                    "max": 100,
                    "weight": 15
                },
                {
                    "dimension": "Data\nCompleteness",
                    "score": int(score_breakdown.get("completeness", 0) * 100),
                    "max": 100,
                    "weight": 15
                },
                {
                    "dimension": "Data\nFreshness",
                    "score": int(score_breakdown.get("freshness", 0) * 100),
                    "max": 100,
                    "weight": 10
                },
                {
                    "dimension": "Fraud\nRisk",
                    "score": int(score_breakdown.get("risk", 0) * 100),
                    "max": 100,
                    "weight": 5
                }
            ]
            
            providers.append({
                "name": row['provider_name'],
                "npi": row['npi'],
                "overallScore": row['confidence_score'],
                "tier": row['confidence_tier'] or "UNKNOWN",
                "path": quality_metrics.get('path', 'UNKNOWN'),
                "dimensions": dimensions,
                "validated_at": row['created_at'].isoformat() if row['created_at'] else None
            })
        
        return {
            "success": True,
            "providers": providers,
            "total": len(providers),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error fetching confidence data: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "providers": []
        }


@app.get("/api/analytics/dashboard-stats")
async def get_dashboard_stats():
    """Returns real stats for Dashboard.jsx."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Total providers
        cursor.execute("SELECT COUNT(*) as count FROM validated_providers")
        total_providers = cursor.fetchone()['count']
        
        # Providers needing review
        cursor.execute("SELECT COUNT(*) as count FROM review_queue WHERE status = 'PENDING'")
        needs_review = cursor.fetchone()['count']
        
        # Average confidence
        cursor.execute("SELECT AVG(confidence_score) as avg FROM validated_providers")
        avg_confidence = cursor.fetchone()['avg'] or 0
        
        # Path distribution - extract from validation_metadata JSON
        cursor.execute("""
            SELECT 
                validation_metadata->'quality_metrics'->>'path' as path,
                COUNT(*) as count
            FROM validated_providers
            WHERE validation_metadata->'quality_metrics'->>'path' IS NOT NULL
            GROUP BY path
        """)
        path_results = cursor.fetchall()
        path_distribution = {row['path']: row['count'] for row in path_results}
        
        # Fraud indicators count - extract from validation_metadata
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM validated_providers
            WHERE validation_metadata->'quality_metrics'->>'fraud_indicator_count' != '0'
        """)
        fraud_detected = cursor.fetchone()['count']
        
        # Recent validations (last 24 hours)
        cursor.execute("""
            SELECT 
                provider_name,
                npi,
                confidence_score,
                confidence_tier,
                validation_metadata,
                created_at
            FROM validated_providers
            WHERE created_at >= NOW() - INTERVAL '24 hours'
            ORDER BY created_at DESC
            LIMIT 10
        """)
        recent_activity = []
        for row in cursor.fetchall():
            validation_metadata = row['validation_metadata'] or {}
            quality_metrics = validation_metadata.get('quality_metrics', {})
            
            recent_activity.append({
                "provider_name": row['provider_name'],
                "npi": row['npi'],
                "confidence_score": row['confidence_score'],
                "tier": row['confidence_tier'] or "UNKNOWN",
                "path": quality_metrics.get('path', 'UNKNOWN'),
                "validated_at": row['created_at'].isoformat()
            })
        
        cursor.close()
        conn.close()
        
        return {
            "success": True,
            "stats": {
                "total_providers": total_providers,
                "needs_review": needs_review,
                "avg_confidence": float(avg_confidence) * 100,
                "path_distribution": path_distribution,
                "fraud_detected": fraud_detected,
                "recent_activity": recent_activity
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error fetching dashboard stats: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "stats": {}
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)