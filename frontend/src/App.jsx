import React, { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./Pages/Home";
import Signin from "./Pages/Signin";
import SignUp from "./Pages/SignUp";
import Dashboard from "./Pages/Dashboard";
import Upload from "./Pages/Upload";
import Provider from "./Pages/Provider";
import ProviderDetail from "./Pages/ProviderDetail";
import Apply from "./Pages/Apply";
import ProtectedRoute from "./Components/ProtectedRoute";
import Analytics from './Pages/Analytics';


const App = () => {
  useEffect(() => {
    Promise.allSettled([
      fetch("http://localhost:8080/api/health").catch(() => {}),
      fetch("http://localhost:8000/api/health").catch(
        () => {}
      ),
    ]).then(() => console.log("Servers warmed up"));
  }, []);

  return (
    <div>
      {/* <GlobalLoader /> */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Signin />} />
        <Route path="/signUp" element={<SignUp />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <Upload />
            </ProtectedRoute>
          }
        />
        <Route path="/provider" element={<Provider />} />
        <Route path="/provider-detail" element={<ProviderDetail />} />
        <Route path="/new-user" element={<Apply />} />
        <Route path="/analytics" element={<Analytics />} />

      </Routes>
    </div>
  );
};

export default App;