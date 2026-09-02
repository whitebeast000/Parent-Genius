const express = require("express");
const router = express.Router();

const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");


// ==========================================
// SEND THERAPY REQUEST
// POST /api/therapy/request
// ==========================================

router.post("/request", verifyToken, async (req, res) => {

    try {

        const { therapy_type } = req.body;

        if (!therapy_type) {
            return res.status(400).json({
                message: "Therapy type is required."
            });
        }

        const allowedTypes = [
            "Individual",
            "Couples",
            "Family"
        ];

        if (!allowedTypes.includes(therapy_type)) {
            return res.status(400).json({
                message: "Invalid therapy type."
            });
        }

        const result = await pool.query(
            `
            INSERT INTO therapy_requests
            (user_id, therapy_type)
            VALUES ($1, $2)
            RETURNING *
            `,
            [
                req.user.userId,
                therapy_type
            ]
        );

        res.status(201).json({
            message: "Therapy request submitted successfully.",
            request: result.rows[0]
        });

    } catch (error) {

        console.error("Therapy request error:", error);

        res.status(500).json({
            message: "Failed to submit therapy request."
        });
    }

});


// ==========================================
// GET MY THERAPY REQUESTS
// GET /api/therapy/requests
// ==========================================

router.get("/requests", verifyToken, async (req, res) => {

    try {

        const result = await pool.query(
            `
            SELECT
                id,
                therapy_type,
                status,
                created_at
            FROM therapy_requests
            WHERE user_id = $1
            ORDER BY created_at DESC
            `,
            [req.user.userId]
        );

        res.json({
            requests: result.rows
        });

    } catch (error) {

        console.error("Therapy requests error:", error);

        res.status(500).json({
            message: "Failed to load therapy requests."
        });
    }

});


module.exports = router;