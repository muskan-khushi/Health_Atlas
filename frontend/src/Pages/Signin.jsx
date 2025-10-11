import React, { useState, useEffect } from "react";
import { useHealthContext } from "../Context/HealthContext";
import assets from "../assets/assets";
import Navbar from "../Components/Navbar";
import { useNavigate } from "react-router-dom";

const Signin = () => {
  const { Dark } = useHealthContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (Dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [Dark]);

  const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    const response = await fetch("http://localhost:8080/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) throw new Error("Login failed");

    const data = await response.json();
    localStorage.setItem("token", data.token);
    console.log("User:", data.user);

    navigate("/dashboard");
  } catch (err) {
    console.error(err);
    alert("Invalid credentials!");
  }
};


  return (
    <div
      className={`flex flex-col items-center justify-center min-h-screen transition-colors duration-500 ${
        Dark ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      <Navbar />

      <div className="flex items-center justify-center px-4 w-full">
        <div
          className={`w-full max-w-md p-8 rounded-2xl shadow-lg transition-colors duration-500 ${
            Dark
              ? "bg-gray-800 text-gray-200 border border-gray-700"
              : "bg-white text-gray-900 border border-gray-200"
          }`}
        >
          <h2 className="text-2xl font-bold text-center mb-6">Login</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Email */}
            <div>
              <label
                className={`block text-sm font-medium mb-1 transition-colors ${
                  Dark ? "text-gray-300" : "text-gray-700"
                }`}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className={`w-full border px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 transition-colors duration-300 ${
                  Dark
                    ? "bg-gray-900 text-gray-200 border-gray-700 placeholder-gray-500"
                    : "bg-white text-gray-900 border-gray-200 placeholder-gray-400"
                }`}
              />
            </div>

            {/* Password */}
            <div>
              <label
                className={`block text-sm font-medium mb-1 transition-colors ${
                  Dark ? "text-gray-300" : "text-gray-700"
                }`}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                className={`w-full border px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 transition-colors duration-300 ${
                  Dark
                    ? "bg-gray-900 text-gray-200 border-gray-700 placeholder-gray-500"
                    : "bg-white text-gray-900 border-gray-200 placeholder-gray-400"
                }`}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="mt-4 w-full py-3 rounded-2xl bg-blue-800  text-white font-semibold hover:bg-blue-900 active:scale-95 transition-transform duration-150"
            >
              Login
            </button>
          </form>

          {/* Sign Up Link */}
          <p
            className={`text-center text-sm mt-4 transition-colors duration-300 ${
              Dark ? "text-gray-400" : "text-gray-500"
            }`}
          >
            Don’t have an account?{" "}
            <span
              onClick={() => navigate("/signUp")}
              className="text-blue-500 cursor-pointer hover:underline hover:text-blue-400 transition-colors"
            >
              Sign Up
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signin;
