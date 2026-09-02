const express = require("express");
const router = express.Router();

const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");

// GET community solutions
router.get("/", async (req, res) => {
    try {
        const { age, topic, search } = req.query;

        let query = `
            SELECT 
                cs.id,
                cs.solution,
                cs.age_group,
                cs.topic,
                cs.created_at,
                u.username
            FROM community_solutions cs
            JOIN users u ON cs.user_id = u.id
            WHERE 1=1
        `;

        const values = [];
        let count = 1;

        if (age) {
            query += ` AND cs.age_group = $${count}`;
            values.push(age);
            count++;
        }

        if (topic) {
            query += ` AND cs.topic = $${count}`;
            values.push(topic);
            count++;
        }

        if (search) {
            query += ` AND (
                cs.solution ILIKE $${count}
                OR cs.topic ILIKE $${count}
                OR u.username ILIKE $${count}
            )`;

            values.push(`%${search}%`);
            count++;
        }

        query += ` ORDER BY cs.created_at DESC`;

        const result = await pool.query(query, values);

        res.json(result.rows);

    } catch (error) {
        console.error("Community GET error:", error);
        res.status(500).json({ message: "Failed to load community solutions" });
    }
});


// POST a new community solution
router.post("/", verifyToken, async (req, res) => {
    try {
        const { solution, age_group, topic } = req.body;

        if (!solution || !solution.trim()) {
            return res.status(400).json({
                message: "Solution is required"
            });
        }

        const result = await pool.query(
            `
            INSERT INTO community_solutions
            (user_id, solution, age_group, topic)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
            [
                req.user.userId,
                solution.trim(),
                age_group || null,
                topic || null
            ]
        );

        res.status(201).json({
            message: "Solution submitted successfully",
            solution: result.rows[0]
        });

    } catch (error) {
        console.error("Community POST error:", error);
        res.status(500).json({
            message: "Failed to submit solution"
        });
    }
});

module.exports = router;