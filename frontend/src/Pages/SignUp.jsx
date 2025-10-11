import { useState, useEffect } from "react";
import { useHealthContext } from "../Context/HealthContext";
import Navbar from "../Components/Navbar";
import { useNavigate } from "react-router-dom";

const SignUp = () => {
  const { Dark } = useHealthContext();
  const navigate = useNavigate();
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("http://localhost:8080/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "Signup failed");

      alert(data.message || "Signup successful! Please login.");
      navigate("/login");
    } catch (err) {
      console.error(err);
      alert(err.message || "Error signing up");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-500 pt-20 ${
        Dark ? "bg-gray-900" : "bg-gray-100"
      }`}
    >
      <Navbar />
      <div className="flex items-center justify-center px-4 pt-20">
        <div
          className={`p-8 rounded-2xl shadow-lg w-full max-w-md transition-colors duration-500 ${
            Dark ? "bg-gray-800 text-gray-200" : "bg-white text-gray-900"
          }`}
        >
          <h2 className="text-2xl font-bold mb-6 text-center">Sign Up</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {["name", "email", "password", "confirmPassword"].map((field) => (
              <input
                key={field}
                type={
                  field.includes("password")
                    ? "password"
                    : field === "email"
                    ? "email"
                    : "text"
                }
                name={field}
                placeholder={field
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (str) => str.toUpperCase())}
                value={formData[field]}
                onChange={handleChange}
                required
                className={`border-2 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-teal-400 transition-colors duration-300 ${
                  Dark
                    ? "bg-gray-900 text-gray-200 border-gray-700 placeholder-gray-500"
                    : "bg-white text-gray-900 border-gray-300 placeholder-gray-400"
                }`}
              />
            ))}

            <button
              type="submit"
              className="bg-blue-800 text-white py-3 rounded-xl font-semibold hover:bg-blue-900 transition"
            >
              {loading ? "Signing Up..." : "Sign Up"}
            </button>
          </form>

          <p
            className={`mt-4 text-center transition-colors duration-300 ${
              Dark ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Already have an account?{" "}
            <span
              className="text-blue-800 cursor-pointer hover:underline"
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
