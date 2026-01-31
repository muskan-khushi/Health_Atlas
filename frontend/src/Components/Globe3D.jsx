import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const Globe3D = () => {
  const mountRef = useRef(null);
  const [stats, setStats] = useState({
    total: 0,
    green: 0,
    yellow: 0,
    red: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if mountRef is available
    if (!mountRef.current) {
      console.error("Mount ref not available");
      return;
    }

    let scene, camera, renderer, globe, atmosphere, providerGroup, lineGroup;
    let providers = [];
    let animationId;
    let isInitialized = false;

    const init = async () => {
      // Double-check mount is still available
      if (!mountRef.current) {
        console.error("Mount ref lost during init");
        return;
      }

      // Fetch real provider data from backend
      try {
        const response = await fetch(`${API_URL}/api/analytics/providers-geolocation`);
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch provider data');
        }

        const realProviders = data.providers || [];
        
        // Count by status
        let greenCount = 0, yellowCount = 0, redCount = 0;
        realProviders.forEach(p => {
          if (p.status === 'green') greenCount++;
          else if (p.status === 'yellow') yellowCount++;
          else redCount++;
        });

        setStats({
          total: realProviders.length,
          green: greenCount,
          yellow: yellowCount,
          red: redCount
        });

        // Verify mount is still available before creating scene
        if (!mountRef.current) {
          console.error("Mount ref lost before scene creation");
          return;
        }

        // Get dimensions safely
        const width = mountRef.current.clientWidth || 800;
        const height = mountRef.current.clientHeight || 600;

        // Scene setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0e1a);
        
        camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        camera.position.z = 3;

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        
        // Final check before appending
        if (!mountRef.current) {
          console.error("Mount ref lost before renderer append");
          renderer.dispose();
          return;
        }
        
        mountRef.current.appendChild(renderer.domElement);
        isInitialized = true;

        // Create Earth globe
        const globeGeometry = new THREE.SphereGeometry(1, 64, 64);
        
        const globeMaterial = new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 }
          },
          vertexShader: `
            varying vec2 vUv;
            varying vec3 vPosition;
            void main() {
              vUv = uv;
              vPosition = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform float time;
            varying vec2 vUv;
            varying vec3 vPosition;
            
            void main() {
              vec3 color1 = vec3(0.05, 0.1, 0.25);
              vec3 color2 = vec3(0.1, 0.2, 0.4);
              
              float gradient = smoothstep(-1.0, 1.0, vPosition.y);
              vec3 finalColor = mix(color1, color2, gradient);
              
              float glow = pow(1.0 - abs(vPosition.y), 2.0) * 0.3;
              finalColor += vec3(0.0, 0.3, 0.5) * glow;
              
              gl_FragColor = vec4(finalColor, 1.0);
            }
          `,
          transparent: false
        });

        globe = new THREE.Mesh(globeGeometry, globeMaterial);
        scene.add(globe);

        // Add atmosphere glow
        const atmosphereGeometry = new THREE.SphereGeometry(1.15, 64, 64);
        const atmosphereMaterial = new THREE.ShaderMaterial({
          vertexShader: `
            varying vec3 vNormal;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec3 vNormal;
            void main() {
              float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
              gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
            }
          `,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          transparent: true
        });
        atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        scene.add(atmosphere);

        // Provider data points (REAL DATA)
        providerGroup = new THREE.Group();
        
        realProviders.forEach(provider => {
          // Convert lat/lon to 3D coordinates
          const phi = (90 - provider.lat) * (Math.PI / 180);
          const theta = (provider.lon + 180) * (Math.PI / 180);
          
          const x = -(1.02 * Math.sin(phi) * Math.cos(theta));
          const y = 1.02 * Math.cos(phi);
          const z = 1.02 * Math.sin(phi) * Math.sin(theta);

          // Color based on status from backend
          const colorMap = {
            'green': 0x00ff88,
            'yellow': 0xffaa00,
            'red': 0xff3355
          };
          const color = colorMap[provider.status] || 0x888888;

          const pointGeometry = new THREE.SphereGeometry(0.008, 8, 8);
          const pointMaterial = new THREE.MeshBasicMaterial({ 
            color,
            transparent: true,
            opacity: 0.9
          });
          const point = new THREE.Mesh(pointGeometry, pointMaterial);
          point.position.set(x, y, z);
          point.userData = { 
            status: provider.status, 
            name: provider.name,
            npi: provider.npi,
            city: provider.city,
            state: provider.state,
            confidence: provider.confidence
          };
          
          providerGroup.add(point);
          providers.push(point);
        });

        scene.add(providerGroup);
        
        // Add connection lines between nearby providers
        lineGroup = new THREE.Group();
        for (let i = 0; i < providers.length; i += 10) {
          const p1 = providers[i];
          const nearbyProviders = providers.filter((p, idx) => {
            if (idx <= i) return false;
            const dist = p1.position.distanceTo(p.position);
            return dist < 0.3;
          });

          nearbyProviders.slice(0, 3).forEach(p2 => {
            const points = [p1.position, p2.position];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ 
              color: 0x2a5a8a,
              transparent: true,
              opacity: 0.2
            });
            const line = new THREE.Line(geometry, material);
            lineGroup.add(line);
          });
        }
        scene.add(lineGroup);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1);
        pointLight.position.set(5, 3, 5);
        scene.add(pointLight);

        setLoading(false);

        // Animation
        let time = 0;
        const animate = () => {
          animationId = requestAnimationFrame(animate);
          time += 0.01;

          if (globe) {
            globe.rotation.y += 0.001;
            atmosphere.rotation.y += 0.001;
            providerGroup.rotation.y += 0.001;
            lineGroup.rotation.y += 0.001;
          }

          // Pulse providers
          providers.forEach((provider, i) => {
            const pulse = Math.sin(time * 2 + i * 0.1) * 0.002 + 0.008;
            provider.scale.set(pulse / 0.008, pulse / 0.008, pulse / 0.008);
            
            if (provider.userData.status === 'red') {
              provider.material.opacity = 0.7 + Math.sin(time * 3 + i * 0.2) * 0.3;
            }
          });

          if (globeMaterial && globeMaterial.uniforms) {
            globeMaterial.uniforms.time.value = time;
          }

          renderer.render(scene, camera);
        };
        animate();

      } catch (err) {
        console.error('Error initializing globe:', err);
        setError(err.message);
        setLoading(false);
        return;
      }
    };

    // Small delay to ensure mount is ready
    const initTimer = setTimeout(() => {
      init();
    }, 100);

    // Handle resize
    const handleResize = () => {
      if (!camera || !renderer || !mountRef.current) return;
      
      const width = mountRef.current.clientWidth || 800;
      const height = mountRef.current.clientHeight || 600;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Mouse interaction
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const handleMouseDown = () => {
      isDragging = true;
    };

    const handleMouseMove = (e) => {
      if (isDragging && globe && providerGroup && lineGroup && atmosphere) {
        const deltaX = e.offsetX - previousMousePosition.x;
        const deltaY = e.offsetY - previousMousePosition.y;

        globe.rotation.y += deltaX * 0.005;
        atmosphere.rotation.y += deltaX * 0.005;
        providerGroup.rotation.y += deltaX * 0.005;
        lineGroup.rotation.y += deltaX * 0.005;
        
        globe.rotation.x += deltaY * 0.005;
        atmosphere.rotation.x += deltaY * 0.005;
        providerGroup.rotation.x += deltaY * 0.005;
        lineGroup.rotation.x += deltaY * 0.005;
      }

      previousMousePosition = { x: e.offsetX, y: e.offsetY };
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    // Add event listeners after renderer is created
    const setupEventListeners = () => {
      if (renderer && renderer.domElement) {
        renderer.domElement.addEventListener('mousedown', handleMouseDown);
        renderer.domElement.addEventListener('mousemove', handleMouseMove);
        renderer.domElement.addEventListener('mouseup', handleMouseUp);
      }
    };

    // Delay event listener setup
    const eventTimer = setTimeout(setupEventListeners, 200);

    // Cleanup
    return () => {
      clearTimeout(initTimer);
      clearTimeout(eventTimer);
      window.removeEventListener('resize', handleResize);
      
      if (renderer && renderer.domElement) {
        renderer.domElement.removeEventListener('mousedown', handleMouseDown);
        renderer.domElement.removeEventListener('mousemove', handleMouseMove);
        renderer.domElement.removeEventListener('mouseup', handleMouseUp);
      }
      
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      
      if (isInitialized && mountRef.current && renderer && renderer.domElement) {
        try {
          mountRef.current.removeChild(renderer.domElement);
        } catch (e) {
          console.warn("Error removing renderer:", e);
        }
      }
      
      // Dispose Three.js resources
      if (renderer) {
        renderer.dispose();
      }
      if (globe && globe.geometry) {
        globe.geometry.dispose();
        globe.material.dispose();
      }
      if (atmosphere && atmosphere.geometry) {
        atmosphere.geometry.dispose();
        atmosphere.material.dispose();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading globe visualization...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">Error: {error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 relative overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-slate-950/90 to-transparent p-8">
        <h1 className="text-4xl font-bold text-white mb-2">
          🌍 Global Provider Network
        </h1>
        <p className="text-slate-300 text-lg">
          Real-time validation status across {stats.total} healthcare providers
        </p>
      </div>

      {/* 3D Globe */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Stats Panel */}
      <div className="absolute bottom-8 left-8 right-8 z-10">
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
          <div className="grid grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-400 mb-1">{stats.total}</div>
              <div className="text-slate-400 text-sm uppercase tracking-wide">Total Providers</div>
            </div>
            <div className="text-center border-l border-slate-700/50">
              <div className="text-3xl font-bold text-emerald-400 mb-1">{stats.green}</div>
              <div className="text-slate-400 text-sm uppercase tracking-wide">🟢 Platinum</div>
              <div className="text-xs text-slate-500 mt-1">
                {stats.total > 0 ? ((stats.green / stats.total) * 100).toFixed(1) : 0}%
              </div>
            </div>
            <div className="text-center border-l border-slate-700/50">
              <div className="text-3xl font-bold text-amber-400 mb-1">{stats.yellow}</div>
              <div className="text-slate-400 text-sm uppercase tracking-wide">🟡 Gold</div>
              <div className="text-xs text-slate-500 mt-1">
                {stats.total > 0 ? ((stats.yellow / stats.total) * 100).toFixed(1) : 0}%
              </div>
            </div>
            <div className="text-center border-l border-slate-700/50">
              <div className="text-3xl font-bold text-rose-400 mb-1">{stats.red}</div>
              <div className="text-slate-400 text-sm uppercase tracking-wide">🔴 Review</div>
              <div className="text-xs text-slate-500 mt-1">
                {stats.total > 0 ? ((stats.red / stats.total) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-slate-700/50 flex justify-between items-center">
            <div className="text-slate-400 text-sm">
              <span className="text-emerald-400 font-semibold">
                {stats.total > 0 ? (((stats.green + stats.yellow) / stats.total) * 100).toFixed(0) : 0}% auto-approval rate
              </span> • 
              <span className="ml-2">Live data from Neon PostgreSQL</span>
            </div>
            <div className="text-xs text-slate-500">
              💡 Drag to rotate • Scroll to zoom
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-24 right-8 bg-slate-950/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 shadow-xl">
        <div className="text-xs text-slate-400 uppercase tracking-wide mb-3">Legend</div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
            <span className="text-slate-300">Platinum (90%+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-400"></div>
            <span className="text-slate-300">Gold (65-89%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-400 animate-pulse"></div>
            <span className="text-slate-300">Needs Review</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Globe3D;