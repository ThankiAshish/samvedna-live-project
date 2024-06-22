const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const csv = require("csvtojson");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Admin = require("../models/admin.model");
const JobSeeker = require("../models/jobSeeker.model");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage: storage });

const adminController = {
  register: (req, res) => {
    const { username, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ message: "An error occurred" });
      }

      Admin.register({ username, password: hash }, (err, result) => {
        if (err) {
          console.log(err);
          return res.status(500).json({ message: "An error occurred" });
        }

        res.json({ message: "Admin registered" });
      });
    });
  },
  login: (req, res) => {
    const { username, password } = req.body;

    Admin.login(username, (err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ message: "An error occurred" });
      }

      if (!result.length) {
        return res
          .status(401)
          .json({ message: "Invalid username or password" });
      }

      const admin = result[0];

      bcrypt.compare(password, admin.password, (err, isMatch) => {
        if (err) {
          console.log(err);
          return res.status(500).json({ message: "An error occurred" });
        }

        if (!isMatch) {
          return res
            .status(401)
            .json({ message: "Invalid username or password" });
        }

        const token = jwt.sign(
          { id: admin.id, username: admin.username, type: "Admin" },
          process.env.JWT_SECRET,
          {
            expiresIn: "1d",
          }
        );

        res.status(200).json({
          user: {
            token,
            type: "Admin",
            id: admin.id,
            username: admin.username,
          },
          message: "Admin Login Successful!",
        });
      });
    });
  },
  getUsersCount: (req, res) => {
    Admin.getUsersCount((err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ message: "An error occurred" });
      } else {
        return res.json(result);
      }
    });
  },
  getRecruiters: (req, res) => {
    Admin.getRecruiters((err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ message: "An error occurred" });
      } else {
        return res.json(result);
      }
    });
  },
  getJobSeekers: (req, res) => {
    Admin.getJobSeekers((err, result) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ message: "An error occurred" });
      } else {
        return res.json(result);
      }
    });
  },
  addFromCSV: [
    upload.single("csv"),
    async (req, res) => {
      const csvFilePath = req.file.path;

      try {
        const csvData = await csv().fromFile(csvFilePath);

        if (!csvData.length) {
          return res.status(400).json({ message: "CSV file is empty" });
        }

        // Use Promise.all to handle multiple rows
        const operations = csvData.map(
          (row) =>
            new Promise((resolve, reject) => {
              JobSeeker.getByEmail(row.email, async (err, result) => {
                if (err) {
                  console.log(err);
                  return reject("An error occurred");
                }

                if (result.length) {
                  // If job seeker exists, resolve without creating a new one
                  resolve(`Job Seeker with email ${row.email} already exists`);
                } else {
                  try {
                    // Hash password and create a new job seeker
                    const hashedPassword = await bcrypt.hash(row.password, 10);
                    row.password = hashedPassword;
                    JobSeeker.create(row, (err, result) => {
                      if (err) {
                        console.log("Database error", err);
                        return reject("Internal server error");
                      } else {
                        resolve("Job Seeker created successfully");
                      }
                    });
                  } catch (error) {
                    reject("Error hashing password");
                  }
                }
              });
            })
        );

        // Wait for all operations to complete
        Promise.all(operations)
          .then((results) => {
            fs.unlink(csvFilePath, (err) => {
              if (err) {
                console.error("Error deleting the CSV file:", err);
                // Even if there's an error deleting the file, respond with the operation results
              }
              res.status(201).json({ messages: results });
            });
          })
          .catch((error) => {
            res.status(500).json({ message: error });
          });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error parsing CSV data" });
      }
    },
  ],
};

module.exports = adminController;
