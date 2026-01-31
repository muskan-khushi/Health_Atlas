import React, { useState } from "react";
import assets from "../assets/assets";
import { MdDashboard, MdUpload } from "react-icons/md";
import {
  HiOutlineChevronLeft,
  HiUsers,
  HiOutlineMenu,
  HiUser,
} from "react-icons/hi";
import { useHealthContext } from "../Context/HealthContext";
import { useNavigate } from "react-router-dom";
import { BarChart3 } from "lucide-react";

const Sidebar = () => {
  const { Dark } = useHealthContext();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Theme helpers
  const sidebarBg = Dark ? "bg-gray-800 text-white" : "bg-white text-gray-900";
  const hoverBg = Dark ? "hover:bg-gray-700" : "hover:bg-gray-100";

  return (
    <>
      {/* Mobile Toggle */}
      <div
        className="lg:hidden cursor-pointer m-4 z-50 mt-10"
        onClick={toggleSidebar}
      >
        {!isSidebarOpen && (
          <HiOutlineMenu
            className={`w-7 h-7 ${
              Dark ? "text-white" : "text-gray-700"
            }`}
          />
        )}
      </div>

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 transform ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarBg} lg:translate-x-0 transition-transform duration-300 ease-in-out
        flex flex-col h-screen w-[70%] sm:w-[50%] md:w-[35%] lg:w-[20%]
        border-r-2 border-gray-300 shadow-lg z-40`}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <div className="w-20">
            <img src={assets.logo} alt="Logo" />
          </div>
          <HiOutlineChevronLeft
            onClick={toggleSidebar}
            className={`w-5 h-5 cursor-pointer lg:hidden ${
              Dark ? "text-white" : "text-gray-700"
            }`}
          />
        </div>

        {/* Navigation */}
        <div className="flex flex-col mt-2">
          <div
            onClick={() => navigate("/dashboard")}
            className={`flex items-center gap-4 p-3 cursor-pointer ${hoverBg}`}
          >
            <MdDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </div>

          <div
            onClick={() => navigate("/upload")}
            className={`flex items-center gap-4 p-3 cursor-pointer ${hoverBg}`}
          >
            <MdUpload className="w-5 h-5" />
            <span>Upload Data</span>
          </div>

          <div
            onClick={() => navigate("/analytics")}
            className={`flex items-center gap-4 p-3 cursor-pointer ${hoverBg}`}
          >
            <BarChart3 className="w-5 h-5" />
            <span>Analytics</span>
          </div>

          <div
            onClick={() => navigate("/provider")}
            className={`flex items-center gap-4 p-3 cursor-pointer ${hoverBg}`}
          >
            <HiUsers className="w-5 h-5" />
            <span>Providers</span>
          </div>

          <div
            onClick={() => navigate("/new-user")}
            className={`flex items-center gap-4 p-3 cursor-pointer ${hoverBg}`}
          >
            <HiUser className="w-5 h-5" />
            <span>New Provider</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
