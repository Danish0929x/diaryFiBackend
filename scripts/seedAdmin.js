require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("../models/admin.model");

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: "admin@diaryfi.com" });

    if (existingAdmin) {
      console.log("⚠️ Admin already exists with email: admin@diaryfi.com");
      console.log("Admin details:", {
        id: existingAdmin._id,
        email: existingAdmin.email,
        name: existingAdmin.name,
        role: existingAdmin.role,
      });
    } else {
      // Create new admin
      const admin = await Admin.create({
        email: "admin@diaryfi.com",
        password: "Admin@123", // Change this to a secure password
        name: "Admin User",
        role: "super_admin",
        isActive: true,
      });

      console.log("✅ Admin created successfully!");
      console.log("Admin details:", {
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      });
      console.log(
        "\n🔐 Default credentials (change these immediately in production):"
      );
      console.log("Email: admin@diaryfi.com");
      console.log("Password: Admin@123");
    }

    await mongoose.connection.close();
    console.log("\n✅ Database connection closed");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error.message);
    if (error.code === 11000) {
      console.error("Duplicate key error - email already exists");
    }
    process.exit(1);
  }
};

seedAdmin();
