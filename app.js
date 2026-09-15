const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
require("dotenv").config()

const app = express()

const PORT = process.env.PORT || 5000

//middleware
app.use(express.json())
app.use(cors())

const studentSchema  = new mongoose.Schema({ // Schema to define the document structure
    name: String,
    email: String,
    course: String
})

const Student = new mongoose.model("student", studentSchema) // it will allow use to perfrom databse operations

// To add new student in database (POST API => CREATE)
app.post("/student", async(req, res) => {
    const newStudent = new Student({
        name: req.body.name,
        email: req.body.email,
        course: req.body.course
    })

    const saveStudent = await newStudent.save()

    res.status(201).json(saveStudent)
})


//To fetch all students from the database (GET API => READ)
app.get("/student", async(req, res) => {
    const student = await Student.find()

    res.json(student)
})

//To update all students from the database (PUT API => UPDATE)
app.put("/student/:id", async(req, res) => {
    const updateStudent = await Student.findByIdAndUpdate(
        req.params.id, //_id
        {
            name: req.body.name,
            email: req.body.email,
            course: req.body.course
        },
        {
            new: true
        }
    )

    if(!updateStudent){
        return res.status(404).json({
            message: "Student not found!"
        })
    }

    res.json({
        message: "Student found",
        student: updateStudent
    })
})

//Delete
app.delete("/student/:id", async(req, res) => {
    const deleteStudent = await Student.findByIdAndDelete(req.params.id)

    if(!deleteStudent){
        return res.status(404).json({
            message: "Student not found!"
        })
    }

    res.json({
        message: "Student deleted successfully",
        student: deleteStudent
    })
})




//creating the connection with MONGODB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connected successfully!")
    })
    .catch((error) => {
        console.log(`MongoDB Connection Error`)
    })

app.listen(PORT, () => {
    console.log(`Express Server running on ${process.env.PORT}`)
})