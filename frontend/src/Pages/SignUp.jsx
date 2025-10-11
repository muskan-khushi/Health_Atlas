import { useState, useEffect } from "react";
import { useHealthContext } from "../Context/HealthContext";
import Navbar from "../Components/Navbar";
import { useNavigate } from "react-router-dom"; // ✅ 1. Import useNavigate

const SignUp = () => {
  const { Dark } = useHealthContext(); // ✅ 2. Removed 'navigate' from here
  const navigate = useNavigate(); // ✅ 3. Get the navigate function directly
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (Dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [Dark]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    console.log("Form Data:", formData);
    navigate("/login");
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-500 pt-20 ${
        Dark ? "bg-[#020817]" : "bg-gray-100"
      }`}
    >
      <Navbar />
      <div className="flex items-center justify-center px-4 pt-20">
        <div
          className={`p-8 rounded-xl shadow-md w-full max-w-md transition-colors duration-500 ${
            Dark ? "bg-gray-800 text-gray-200" : "bg-white text-gray-900"
          }`}
        >
          <h2 className="text-2xl font-bold mb-6 text-center">Sign Up</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="text"
              name="name"
              placeholder="Full Name"
              value={formData.name}
              onChange={handleChange}
              className={`border-2 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors duration-300 ${
                Dark
                  ? "bg-gray-900 text-gray-200 border-gray-700 placeholder-gray-500"
                  : "bg-white text-gray-900 border-gray-300"
              }`}
              required
            />

            <input
              type="email"
              name="email"
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              className={`border-2 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors duration-300 ${
                Dark
                  ? "bg-gray-900 text-gray-200 border-gray-700 placeholder-gray-500"
                  : "bg-white text-gray-900 border-gray-300"
              }`}
              required
            />

            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className={`border-2 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors duration-300 ${
                Dark
                  ? "bg-gray-900 text-gray-200 border-gray-700 placeholder-gray-500"
                  : "bg-white text-gray-900 border-gray-300"
              }`}
              required
            />

            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={`border-2 rounded-lg p-3 focus:outline-none focus:border-blue-500 transition-colors duration-300 ${
                Dark
                  ? "bg-gray-900 text-gray-200 border-gray-700 placeholder-gray-500"
                  : "bg-white text-gray-900 border-gray-300"
              }`}
              required
            />

            <button
              type="submit"
              className="bg-blue-900 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 transition"
            >
              Sign Up
            </button>
          </form>

          <p
            className={`mt-4 text-center transition-colors duration-300 ${
              Dark ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Already have an account?{" "}
            <span
              className="text-blue-600 cursor-pointer hover:underline"
              onClick={() => navigate("/login")}
            >
              Login
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
