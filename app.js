const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

// Custom Authentication Middleware
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Access Denied. No token provided."
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            message: "Access Denied. Invalid or expired token."
        });
    }
};

const authorizedRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({
                message: "Access denied. Role not specified."
            });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: "Access denied. User not authorized for this role."
            });
        }
        next();
    };
};

// Cloudinary Storage Config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "student-files"
    }
});
const parser = multer({ storage: storage });

// Nodemailer Config
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Standalone File Upload Route
app.post("/upload", parser.single("file"), async (req, res) => {
    res.json({
        message: "File uploaded successfully!",
        file: req.file
    });
});

// Test Email Route
app.post("/test-email", async (req, res) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_ADMIN,
            subject: "Testing Email",
            text: "Nodemailer has been configured properly"
        });

        res.json({
            message: "Email sent successfully"
        });
    } catch (error) {
        res.status(500).json({
            message: "Error sending email",
            error: error.message
        });
    }
});

// Mongoose Schemas & Models
const studentSchema = new mongoose.Schema({
    name: String,
    email: String,
    course: String,
    file: String
});

const Student = mongoose.model("student", studentSchema);

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    role: {
        type: String,
        enum: ["admin", "user"],
        default: "user"
    }
});

const User = mongoose.model("user", userSchema);

// User Authentication Routes
app.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existUser = await User.findOne({ email });

        if (existUser) {
            return res.status(400).json({
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            email,
            password: hashedPassword
        });

        await newUser.save();

        res.status(201).json({
            message: "Signup Successful!"
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({
                message: "Invalid Email!"
            });
        }

        const isCorrectPass = await bcrypt.compare(password, user.password);

        if (!isCorrectPass) {
            return res.status(400).json({
                message: "Invalid Password!"
            });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.status(200).json({
            message: "Login Successful!",
            token: token
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Student Management Routes
app.post("/student", verifyToken, authorizedRole("admin"), parser.single("file"), async (req, res) => {
    try {
        const newStudent = new Student({
            name: req.body.name,
            email: req.body.email,
            course: req.body.course,
            file: req.file ? req.file.path : null
        });

        const saveStudent = await newStudent.save();

        const emailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_ADMIN,
            subject: "New Student Registered",
            html: `
            <div>
                <h2>New Student added</h2>
                <p>A new student has been added to the system:</p>
                <ul>
                    <li>Name: <strong>${saveStudent.name}</strong></li>
                    <li>Email: <strong>${saveStudent.email}</strong></li>
                    <li>Course: <strong>${saveStudent.course}</strong></li>
                </ul>
            </div>
            `
        };

        await transporter.sendMail(emailOptions);
        res.status(201).json(saveStudent);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get("/student", verifyToken, authorizedRole("admin", "user"), async (req, res) => {
    try {
        const students = await Student.find();
        res.json(students);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.put("/student/:id", verifyToken, authorizedRole("admin"), parser.single("file"), async (req, res) => {
    try {
        const updateData = {
            name: req.body.name,
            email: req.body.email,
            course: req.body.course
        };

        if (req.file) {
            updateData.file = req.file.path;
        }

        const updateStudent = await Student.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );

        if (!updateStudent) {
            return res.status(404).json({
                message: "Student not found!"
            });
        }

        res.json({
            message: "Student updated successfully",
            student: updateStudent
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.delete("/student/:id", verifyToken, authorizedRole("admin"), async (req, res) => {
    try {
        const deleteStudent = await Student.findByIdAndDelete(req.params.id);

        if (!deleteStudent) {
            return res.status(404).json({
                message: "Student not found!"
            });
        }

        res.json({
            message: "Student deleted successfully",
            student: deleteStudent
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Database Connection & Server Listen
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connected successfully!");
    })
    .catch((error) => {
        console.error("MongoDB Connection Error:", error);
    });

app.listen(PORT, () => {
    console.log(`Express Server running on port ${PORT}`);
});