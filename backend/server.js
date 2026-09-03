const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const nodemailer = require("nodemailer");


const app = express();
const pool = require("./db");
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});


const verifyToken = require("./middleware/verifyToken");
const trainingRoutes = require("./routes/training");
const communityRoutes = require("./routes/community");
const therapyRoutes = require("./routes/therapy");
const resourcesRoutes = require("./routes/resources");
const courseRoutes = require("./routes/courses");


app.use(cors());
app.use(express.json());
app.use("/api/training", trainingRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/therapy", therapyRoutes);
app.use("/api/resources", resourcesRoutes);
app.use("/api/courses", courseRoutes);


const PORT = 3000;




app.get("/", (req, res) => {
    res.send("Welcome to Parent Genius Backend");
});

app.get("/api/test", (req, res) =>{
  console.log(req.body);

  res.json({
    message: "Data received!",
    data: req.body
  })
});


app.get("/api/users/count", async(req,res) => {
  const result =  await pool.query("Select COUNT(*) FROM users");

  res.json({
    users: result.rows[0].count
  });
});

app.post("/api/signup", async (req, res) => 
  {
    try
      {   
        const { username, email, password } = req.body;

        if (!username || !email || !password) 
        {
          return res.status(400).json({
            message: "Username, email, and password are required."
          });
        }

        if(!email.includes("@"))
        {
          return res.status(400).json({
            message: "Please enter a valid email address."
          })
        }

        if(password.length <6)
        {
          return res.status(400).json({
            message: "Password should be at least 6 characters long."
          })
        }

        await pool.query(
                "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
                [username,email,password]
        );

        res.json({
              message: "User Created Successfully!"

        });
      }catch(error){
        console.error(error);

        res.status(400).json({
          message:"Email or username already exists!"
        });
      }
  });

app.post("/api/login", async (req, res) => {

  const {username,password} =  req.body;

  if (!username || !password) {
    return res.status(400).json({
        message: "Username and password are required."
    });
  }

  const result = await pool.query(
    "Select * FROM users WHERE username = $1", 
    [username]
  );

  if(result.rows.length === 0)
  {
    return res.status(400).json({
      message: "Invalid username or password."
    });
  }

  const user = result.rows[0];

  if(password !== user.password)
  {
    return res.status(401).json({
      message: "invalid username or password."
    });
  }


  const token =  jwt.sign(
    {
      userId: user.id,
      username: user.username
    },
    
    process.env.JWT_SECRET,
    {expiresIn: "1h"}
  );
  
  res.json({
    message: "Login successful",
    username: user.username,
    token: token
    });

});


app.post( "/api/forgot-password" , async (req, res) =>{

  const {email} = req.body;

  if(!email)
  {
    return res.status(400).json({
      message:"Email is required."
    });
  }

  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  if(result.rows.length === 0)
  {
    return res.status(404).json({
      message: "Email not found."
    }); 
  }

  const otp = Math.floor(100000 + Math.random() * 900000);

  const user = result.rows[0];

  await pool.query(
    "INSERT INTO password_resets (user_id, otp , expires_at) VALUES ($1,$2,NOW() + INTERVAL '10 minutes')",
    [user.id, otp]
  );

//   SEND OTP TO EMAIL

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "ParentGenius Password Reset OTP",
        text: `Your ParentGenius password reset OTP is: ${otp}. This OTP expires in 10 minutes.`
    }); 

    res.json({
        message: "OTP generated successfully.",
    });

});


app.post("/api/verify-otp", async (req, res) => {

  const {email, otp } = req.body;

  if(!email || !otp )
  {
    return res.status(400).json({
      message: "Email and OTP are required."
    });
  }

  const result =  await pool.query(
    `SELECT password_resets.* FROM password_resets 
    JOIN users on password_resets.user_id = users.id
    WHERE users.email = $1
    AND password_resets.otp = $2 
    AND password_resets.expires_at > NOW()
    ORDER BY password_resets.id DESC
    LIMIT 1`,
    [email, otp]
    );

    if (result.rows.length === 0)
    {
      return res.status(400).json({
        message: "Invalid email or OTP."
      });
    }

    res.json({
      message: "OTP verified successfully."
    })

  });


app.post("/api/reset-password", async (req, res) => {

  const {email, otp ,  newPassword} = req.body;

  if(!email || !otp ||  !newPassword)
  {
    return res.status(400).json({
      message: "Email, OTP and new password are required."
    });
  }

  if(newPassword.length < 6)
  {
    return res.status(400).json({
      message: "New password must be at least 6 characters long."
    });
  }

  const result = await pool.query(
    `SELECT password_resets.* FROM password_resets
    JOIN users ON password_resets.user_id = users.id
    WHERE users.email = $1 
    AND password_resets.otp = $2
    AND password_resets.expires_at > NOW()
    ORDER BY password_resets.id DESC
    LIMIT 1`,
    [email, otp]
  );

  if(result.rows.length === 0)
  {
    return res.status(400).json({
      message: "Invalid email or OTP."
    });
  }

  const userId  = result.rows[0].user_id;

  await pool.query(
    "UPDATE users SET password = $1 WHERE id = $2",
    [newPassword, userId]
  );

     res.json({
        message: "Password reset successful."
    });


  });

// JWT Authentication

app.get("/api/me", verifyToken, async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT id, username, email
             FROM users
             WHERE id = $1`,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        res.json({
            user: result.rows[0]
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Server error."
        });
    }
});

app.get("/api/profile-status", verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id
             FROM parent_questionnaire
             WHERE user_id = $1`,
            [req.user.userId]
        );

        res.json({
            profileCompleted: result.rows.length > 0
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error."
        });
    }
});

app.post("/api/profile", verifyToken, async (req, res) => {

   
    const {
        full_name,
        phone,
        country,
        timezone,
        profile_image
    } = req.body;

    try {

        const result = await pool.query(
            `INSERT INTO profiles
            (user_id, full_name, phone, country, timezone, profile_image)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [
                req.user.userId,
                full_name,
                phone,
                country,
                timezone,
                profile_image
            ]
        );

        res.status(201).json({
            message: "Profile created successfully.",
            profile: result.rows[0]
        });

    } catch (error) {

        console.error(error);

        res.status(400).json({
            message: "Profile already exists or invalid data."
        });
    }
});

app.get("/api/profile", verifyToken, async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT id, user_id, full_name, phone, country, timezone, profile_image
             FROM profiles
             WHERE user_id = $1`,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Profile not found."
            });
        }

        res.json({
            profile: result.rows[0]
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Server error."
        });
    }
});

app.put("/api/profile", verifyToken, async (req, res) => {

    const {
        full_name,
        phone,
        country,
        timezone,
        profile_image
    } = req.body;

    try {

        const result = await pool.query(
            `UPDATE profiles
             SET full_name = $1,
                 phone = $2,
                 country = $3,
                 timezone = $4,
                 profile_image = $5
             WHERE user_id = $6
             RETURNING *`,
            [
                full_name,
                phone,
                country,
                timezone,
                profile_image,
                req.user.userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Profile not found."
            });
        }

        res.json({
            message: "Profile updated successfully.",
            profile: result.rows[0]
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Server error."
        });
    }
});


app.delete("/api/profile", verifyToken, async (req, res) => {

    try {

        const result = await pool.query(
            `DELETE FROM profiles
             WHERE user_id = $1
             RETURNING *`,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Profile not found."
            });
        }

        res.json({
            message: "Profile deleted successfully."
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Server error."
        });
    }
});


app.post("/api/children", verifyToken, async (req, res) => {

    const { child_number, age } = req.body;

    if (!child_number) {
        return res.status(400).json({
            message: "Child number is required."
        });
    }

    try {

        const result = await pool.query(
            `INSERT INTO children (user_id, child_number, age)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [req.user.userId, child_number, age]
        );

        res.status(201).json({
            message: "Child added successfully.",
            child: result.rows[0]
        });

    } catch (error) {

        console.error(error);

        res.status(400).json({
            message: "Child already exists or invalid data."
        });
    }
});

app.get("/api/children", verifyToken, async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT id, user_id, child_number, age
             FROM children
             WHERE user_id = $1
             ORDER BY child_number`,
            [req.user.userId]
        );

        res.json({
            children: result.rows
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Server error."
        });
    }
});

app.put("/api/children/:id", verifyToken, async (req, res) => {

    const { age } = req.body;
    const childId = req.params.id;

    if (age === undefined) {
        return res.status(400).json({
            message: "Age is required."
        });
    }

    try {

        const result = await pool.query(
            `UPDATE children
             SET age = $1
             WHERE id = $2
             AND user_id = $3
             RETURNING *`,
            [age, childId, req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Child not found."
            });
        }

        res.json({
            message: "Child updated successfully.",
            child: result.rows[0]
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Server error."
        });
    }
});

app.delete("/api/children/:id", verifyToken, async (req, res) => {

  const childId = req.params.id;

  try
  {
    const result = await pool.query 
    (
      `DELETE FROM children
      WHERE id = $1 
      AND user_id= $2
      RETURNING *`,
      [childId, req.user.userId]
    );

  if (result.rows.length === 0)
    {
        return res.status(404).json({
                    message: "Child not found."
                });
    }

    res.json({
      message: "Child deleted successfully."
    });
} catch (error)
      {   
        console.error(error);

        res.status(500).json({
          message: "Server error."
        });
      } 

});

// QUESTIONNAIRE

 app.get("/api/questionnaire", verifyToken , async (req, res) => {
      
      
        try{
      
          const result = await pool.query(
            `SELECT * FROM parent_questionnaire
            WHERE user_id = $1`,
            [req.user.userId]
          );
      
          if(result.rows.length === 0)
          {
            return res.status(404).json({
                message: "Questionnaire not found."
            });
          }
      
          res.json({
            questionnaire: result.rows[0]
          })
      
        }
        catch(error)
        {
          console.error(error)
        
          res.status(500).json({
            message: "Server error."
          });
        }
      });

app.post("/api/questionnaire", verifyToken, async (req, res) => {

        const {parent_type, goals, values, confidence, email_preference, current_needs} =  req.body;


        try{


        const result = await pool.query(
            `INSERT INTO parent_questionnaire
            (user_id, parent_type, goals, values, confidence, email_preference, current_needs)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
                req.user.userId,
                parent_type,
                goals,
                values,
                confidence,
                email_preference,
                current_needs
            ]
        );

        res.status(201).json({
            message: "Questionnaire saved successfully.",
            questionnaire: result.rows[0]
        });

        }
        catch (error)
        {
          console.error(error);

        res.status(400).json({
            message: "Questionnaire already exists or invalid data."
        });

        }

        
      });
      
app.put("/api/questionnaire", verifyToken, async (req, res) => {

    const {
        parent_type,
        goals,
        values,
        confidence,
        email_preference,
        current_needs
    } = req.body;

    try {

        const result = await pool.query(
            `UPDATE parent_questionnaire
             SET parent_type = $1,
                 goals = $2,
                 values = $3,
                 confidence = $4,
                 email_preference = $5,
                 current_needs = $6
             WHERE user_id = $7
             RETURNING *`,
            [
                parent_type,
                goals,
                values,
                confidence,
                email_preference,
                current_needs,
                req.user.userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Questionnaire not found."
            });
        }

        res.json({
            message: "Questionnaire updated successfully.",
            questionnaire: result.rows[0]
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Server error."
        });
    }
});
      
// NEWSLETTER

app.post("/api/newsletter", async (req, res) => {

    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            message: "Email is required."
        });
    }

    if (!email.includes("@")) {
        return res.status(400).json({
            message: "Please enter a valid email address."
        });
    }

    try {

        await pool.query(
            `INSERT INTO newsletter_subscribers (email)
             VALUES ($1)`,
            [email]
        );

        res.status(201).json({
            message: "Subscribed to newsletter successfully."
        });

    } catch (error) {

        if (error.code === "23505") {
            return res.status(400).json({
                message: "Email is already subscribed."
            });
        }

        console.error(error);

        res.status(500).json({
            message: "Server error."
        });
    }
});



// ========================================
// GET USER PROGRESS
// ========================================

app.get("/api/progress", verifyToken, async (req, res) => {

    try {

        // Get existing progress
        let result = await pool.query(
            `SELECT id, user_id, points, tier
             FROM user_progress
             WHERE user_id = $1`,
            [req.user.userId]
        );

        // If user doesn't have a progress record yet,
        // create one automatically.
        if (result.rows.length === 0) {

            result = await pool.query(
                `INSERT INTO user_progress (user_id, points, tier)
                 VALUES ($1, 0, 1)
                 RETURNING id, user_id, points, tier`,
                [req.user.userId]
            );
        }

        const progress = result.rows[0];

        res.json({
            progress: progress
        });

    } catch (error) {

        console.error("Progress error:", error);

        res.status(500).json({
            message: "Server error."
        });
    }
});


// ========================================
// ADD POINTS
// ========================================

app.put("/api/progress/points", verifyToken, async (req, res) => {

    const { points } = req.body;

    if (!Number.isInteger(points)) {
        return res.status(400).json({
            message: "Points must be a number."
        });
    }

    try {

        // Make sure progress exists
        await pool.query(
            `INSERT INTO user_progress (user_id, points, tier)
             VALUES ($1, 0, 1)
             ON CONFLICT (user_id) DO NOTHING`,
            [req.user.userId]
        );

        // Add points
        const result = await pool.query(
            `UPDATE user_progress
             SET points = points + $1
             WHERE user_id = $2
             RETURNING id, user_id, points, tier`,
            [points, req.user.userId]
        );

        const progress = result.rows[0];

        // Calculate tier from total points
        let tier;

        if (progress.points >= 2000) {
            tier = 5;
        } else if (progress.points >= 1000) {
            tier = 4;
        } else if (progress.points >= 500) {
            tier = 3;
        } else if (progress.points >= 200) {
            tier = 2;
        } else {
            tier = 1;
        }

        // Save calculated tier
        const updated = await pool.query(
            `UPDATE user_progress
             SET tier = $1
             WHERE user_id = $2
             RETURNING id, user_id, points, tier`,
            [tier, req.user.userId]
        );

        res.json({
            message: "Points updated successfully.",
            progress: updated.rows[0]
        });

    } catch (error) {

        console.error("Points update error:", error);

        res.status(500).json({
            message: "Server error."
        });
    }
});


app.post("/api/progress/points", verifyToken, async (req, res) => {

    try {

        const { points } = req.body;

        if (!Number.isInteger(points) || points <= 0) {
            return res.status(400).json({
                message: "Points must be a positive integer."
            });
        }

        let result = await pool.query(
            `SELECT id, user_id, points, tier
             FROM user_progress
             WHERE user_id = $1`,
            [req.user.userId]
        );

        if (result.rows.length === 0) {

            result = await pool.query(
                `INSERT INTO user_progress
                 (user_id, points, tier)
                 VALUES ($1, 0, 1)
                 RETURNING id, user_id, points, tier`,
                [req.user.userId]
            );
        }

        const currentPoints = result.rows[0].points;
        const newPoints = currentPoints + points;
        const newTier = calculateTier(newPoints);

        const updated = await pool.query(
            `UPDATE user_progress
             SET points = $1,
                 tier = $2
             WHERE user_id = $3
             RETURNING id, user_id, points, tier`,
            [
                newPoints,
                newTier,
                req.user.userId
            ]
        );

        res.json({
            message: "Points added successfully.",
            progress: updated.rows[0]
        });

    } catch (error) {

        console.error("Add points error:", error);

        res.status(500).json({
            message: "Server error."
        });
    }
});









// ------------------------------------------------------------
// GET CHALLENGE PROGRESS
// GET /api/challenge/progress
// ------------------------------------------------------------

app.get("/api/challenge/progress", verifyToken, async (req, res) => {

    try {

        let result = await pool.query(
            `SELECT
                id,
                user_id,
                current_day,
                completed_days,
                streak,
                last_completed_date,
                updated_at
             FROM challenge_progress
             WHERE user_id = $1`,
            [req.user.userId]
        );


        // Create challenge progress automatically

        if (result.rows.length === 0) {

            result = await pool.query(
                `INSERT INTO challenge_progress
                 (
                    user_id,
                    current_day,
                    completed_days,
                    streak
                 )
                 VALUES ($1, 1, 0, 0)
                 RETURNING
                    id,
                    user_id,
                    current_day,
                    completed_days,
                    streak,
                    last_completed_date,
                    updated_at`,
                [req.user.userId]
            );
        }


        const challenge = result.rows[0];


        // Calculate percentage

        const percentage = Math.min(
            Math.round((challenge.completed_days / 30) * 100),
            100
        );


        res.json({

            challenge: {

                id: challenge.id,

                user_id: challenge.user_id,

                current_day: challenge.current_day,

                completed_days: challenge.completed_days,

                total_days: 30,

                percentage: percentage,

                streak: challenge.streak,

                last_completed_date: challenge.last_completed_date,

                updated_at: challenge.updated_at
            }

        });

    }

    catch (error) {

        console.error("Challenge progress error:", error);

        res.status(500).json({
            message: "Server error."
        });
    }
});



// ------------------------------------------------------------
// COMPLETE CURRENT CHALLENGE DAY
// POST /api/challenge/complete
//
// Body:
// {
//     "points": 100
// }
//
// points is optional.
// Default = 100
// ------------------------------------------------------------

app.post("/api/challenge/complete", verifyToken, async (req, res) => {

    const client = await pool.connect();


    try {

        const userId = req.user.userId;

        const pointsEarned = Number.isInteger(req.body.points)
            ? req.body.points
            : 100;


        if (pointsEarned <= 0) {

            return res.status(400).json({
                message: "Points must be greater than 0."
            });
        }


        await client.query("BEGIN");


        // ----------------------------------------------------
        // Get challenge progress
        // ----------------------------------------------------

        let challengeResult = await client.query(
            `SELECT
                id,
                user_id,
                current_day,
                completed_days,
                streak,
                last_completed_date
             FROM challenge_progress
             WHERE user_id = $1
             FOR UPDATE`,
            [userId]
        );


        // Create challenge progress if necessary

        if (challengeResult.rows.length === 0) {

            challengeResult = await client.query(
                `INSERT INTO challenge_progress
                 (
                    user_id,
                    current_day,
                    completed_days,
                    streak
                 )
                 VALUES ($1, 1, 0, 0)
                 RETURNING
                    id,
                    user_id,
                    current_day,
                    completed_days,
                    streak,
                    last_completed_date
                `,
                [userId]
            );
        }


        const challenge = challengeResult.rows[0];


        // ----------------------------------------------------
        // Check if challenge is already completed
        // ----------------------------------------------------

        if (challenge.completed_days >= 30) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "30-Day Challenge is already completed."
            });
        }


        // ----------------------------------------------------
        // Prevent completing twice on the same day
        // ----------------------------------------------------

      const todayResult = await client.query(
    `SELECT CURRENT_DATE::text AS today`
            );

const today = todayResult.rows[0].today;


if (challenge.last_completed_date) {

    const lastDate =
        String(challenge.last_completed_date).split("T")[0];

    if (lastDate === today) {

        await client.query("ROLLBACK");

        return res.status(400).json({
            message: "Today's challenge has already been completed."
        });
    }
}


        // ----------------------------------------------------
        // Calculate new challenge values
        // ----------------------------------------------------

        const newCompletedDays =
            challenge.completed_days + 1;


        const newCurrentDay =
            Math.min(newCompletedDays + 1, 30);


        // For now streak increases with each completed day.
        // We can make this calendar-based later.

        const newStreak =
            challenge.streak + 1;


        // ----------------------------------------------------
        // Update challenge progress
        // ----------------------------------------------------

        const updatedChallenge = await client.query(
            `UPDATE challenge_progress

             SET
                current_day = $1,
                completed_days = $2,
                streak = $3,
                last_completed_date = CURRENT_DATE,
                updated_at = CURRENT_TIMESTAMP

             WHERE user_id = $4

             RETURNING
                id,
                user_id,
                current_day,
                completed_days,
                streak,
                last_completed_date,
                updated_at`,
            [
                newCurrentDay,
                newCompletedDays,
                newStreak,
                userId
            ]
        );


        // ----------------------------------------------------
        // Get user progress
        // ----------------------------------------------------

        let progressResult = await client.query(
            `SELECT
                id,
                user_id,
                points,
                tier
             FROM user_progress
             WHERE user_id = $1
             FOR UPDATE`,
            [userId]
        );


        // Create user progress if necessary

        if (progressResult.rows.length === 0) {

            progressResult = await client.query(
                `INSERT INTO user_progress
                 (
                    user_id,
                    points,
                    tier
                 )
                 VALUES ($1, 0, 1)

                 RETURNING
                    id,
                    user_id,
                    points,
                    tier`,
                [userId]
            );
        }


        const currentPoints =
            progressResult.rows[0].points;


        const newPoints =
            currentPoints + pointsEarned;


        const newTier =
            calculateTier(newPoints);


        // ----------------------------------------------------
        // Update points + tier
        // ----------------------------------------------------

        const updatedProgress = await client.query(
            `UPDATE user_progress

             SET
                points = $1,
                tier = $2

             WHERE user_id = $3

             RETURNING
                id,
                user_id,
                points,
                tier`,
            [
                newPoints,
                newTier,
                userId
            ]
        );


        // ----------------------------------------------------
        // Calculate percentage
        // ----------------------------------------------------

        const percentage = Math.min(
            Math.round((newCompletedDays / 30) * 100),
            100
        );


        // ----------------------------------------------------
        // Everything succeeded
        // ----------------------------------------------------

        await client.query("COMMIT");


        res.json({

            message: "Challenge completed successfully.",

            challenge: {

                current_day: newCurrentDay,

                completed_days: newCompletedDays,

                total_days: 30,

                percentage: percentage,

                streak: newStreak
            },

            progress: {

                points: newPoints,

                tier: newTier
            },

            points_earned: pointsEarned
        });

    }

    catch (error) {

        await client.query("ROLLBACK");

        console.error(
            "Challenge completion error:",
            error
        );

        res.status(500).json({
            message: "Server error."
        });
    }

    finally {

        client.release();
    }
});


// ============================================================
// GET TRAINING PROGRESS
// GET /api/training/progress
// ============================================================

app.get("/api/training/progress", verifyToken, async (req, res) => {

    try {

        let result = await pool.query(
            `SELECT
                id,
                user_id,
                parent_completed,
                child_completed,
                tutorials_completed,
                updated_at
             FROM training_progress
             WHERE user_id = $1`,
            [req.user.userId]
        );


        // Create progress automatically if it doesn't exist

        if (result.rows.length === 0) {

            result = await pool.query(
                `INSERT INTO training_progress
                 (
                    user_id,
                    parent_completed,
                    child_completed,
                    tutorials_completed
                 )
                 VALUES ($1, 0, 0, 0)
                 RETURNING
                    id,
                    user_id,
                    parent_completed,
                    child_completed,
                    tutorials_completed,
                    updated_at`,
                [req.user.userId]
            );

        }


        res.json({
            training: result.rows[0]
        });

    }

    catch (error) {

        console.error(
            "Training progress error:",
            error
        );

        res.status(500).json({
            message: "Server error."
        });

    }

});

// ============================================================
// COMPLETE TRAINING
// POST /api/training/complete
//
// Body:
//
// {
//     "type": "parent"
// }
//
// OR
//
// {
//     "type": "child"
// }
//
// OR
//
// {
//     "type": "tutorial"
// }
// ============================================================

app.post("/api/training/complete", verifyToken, async (req, res) => {

    const client = await pool.connect();

    try {

        const userId = req.user.userId;

        const type = req.body.type;


        // ----------------------------------------------------
        // Validate training type
        // ----------------------------------------------------

        const allowedTypes = [
            "parent",
            "child",
            "tutorial"
        ];


        if (!allowedTypes.includes(type)) {

            return res.status(400).json({
                message:
                    "Invalid training type. Use parent, child or tutorial."
            });

        }


        // ----------------------------------------------------
        // Points awarded for each training completion
        // ----------------------------------------------------

        const pointsEarned = 50;


        await client.query("BEGIN");


        // ----------------------------------------------------
        // Get training progress
        // ----------------------------------------------------

        let trainingResult = await client.query(
            `SELECT
                id,
                user_id,
                parent_completed,
                child_completed,
                tutorials_completed
             FROM training_progress
             WHERE user_id = $1
             FOR UPDATE`,
            [userId]
        );


        // ----------------------------------------------------
        // Create progress if it doesn't exist
        // ----------------------------------------------------

        if (trainingResult.rows.length === 0) {

            trainingResult = await client.query(
                `INSERT INTO training_progress
                 (
                    user_id,
                    parent_completed,
                    child_completed,
                    tutorials_completed
                 )
                 VALUES ($1, 0, 0, 0)
                 RETURNING
                    id,
                    user_id,
                    parent_completed,
                    child_completed,
                    tutorials_completed`,
                [userId]
            );

        }


        const training = trainingResult.rows[0];


        // ----------------------------------------------------
        // Determine which column to update
        // ----------------------------------------------------

        let columnName;


        if (type === "parent") {

            columnName = "parent_completed";

        }

        else if (type === "child") {

            columnName = "child_completed";

        }

        else {

            columnName = "tutorials_completed";

        }


        // ----------------------------------------------------
        // Increase completion count
        // ----------------------------------------------------

        const updatedTraining = await client.query(
            `UPDATE training_progress
             SET
                ${columnName} = ${columnName} + 1,
                updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1
             RETURNING
                id,
                user_id,
                parent_completed,
                child_completed,
                tutorials_completed,
                updated_at`,
            [userId]
        );


        // ----------------------------------------------------
        // Get user points
        // ----------------------------------------------------

        let progressResult = await client.query(
            `SELECT
                id,
                user_id,
                points,
                tier
             FROM user_progress
             WHERE user_id = $1
             FOR UPDATE`,
            [userId]
        );


        // ----------------------------------------------------
        // Create user progress if necessary
        // ----------------------------------------------------

        if (progressResult.rows.length === 0) {

            progressResult = await client.query(
                `INSERT INTO user_progress
                 (
                    user_id,
                    points,
                    tier
                 )
                 VALUES ($1, 0, 1)
                 RETURNING
                    id,
                    user_id,
                    points,
                    tier`,
                [userId]
            );

        }


        const currentPoints =
            progressResult.rows[0].points;


        const newPoints =
            currentPoints + pointsEarned;


        const newTier =
            calculateTier(newPoints);


        // ----------------------------------------------------
        // Update points and tier
        // ----------------------------------------------------

        const updatedProgress = await client.query(
            `UPDATE user_progress
             SET
                points = $1,
                tier = $2
             WHERE user_id = $3
             RETURNING
                id,
                user_id,
                points,
                tier`,
            [
                newPoints,
                newTier,
                userId
            ]
        );


        // ----------------------------------------------------
        // Commit everything
        // ----------------------------------------------------

        await client.query("COMMIT");


        // ----------------------------------------------------
        // Response
        // ----------------------------------------------------

        res.json({

            message:
                "Training completed successfully.",

            training:
                updatedTraining.rows[0],

            progress:
                updatedProgress.rows[0],

            training_type:
                type,

            points_earned:
                pointsEarned

        });

    }

    catch (error) {

        await client.query("ROLLBACK");

        console.error(
            "Training completion error:",
            error
        );

        res.status(500).json({
            message: "Server error."
        });

    }

    finally {

        client.release();

    }

});







app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });




    

