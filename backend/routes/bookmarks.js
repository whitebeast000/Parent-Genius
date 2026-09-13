const express = require("express");
const router = express.Router();

const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");


// ========================================
// GET USER BOOKMARKS
// GET /api/bookmarks
// ========================================

router.get("/", verifyToken, async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT
                b.id,
                b.course_id,
                b.created_at,
                c.title,
                c.description,
                c.topic,
                c.rating,
                c.image_url
             FROM bookmarks b
             JOIN courses c
             ON b.course_id = c.id
             WHERE b.user_id = $1
             ORDER BY b.created_at DESC`,
            [req.user.userId]
        );

        res.json({
            bookmarks: result.rows
        });

    } catch (error) {

        console.error("Get bookmarks error:", error);

        res.status(500).json({
            message: "Server error."
        });

    }
});


// ========================================
// ADD BOOKMARK
// POST /api/bookmarks/:courseId
// ========================================

router.post("/:courseId", verifyToken, async (req, res) => {

    const courseId = req.params.courseId;

    try {

        const result = await pool.query(
            `INSERT INTO bookmarks
                (user_id, course_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, course_id)
             DO NOTHING
             RETURNING *`,
            [req.user.userId, courseId]
        );

        if (result.rows.length === 0) {

            return res.json({
                message: "Course is already bookmarked."
            });

        }

        res.status(201).json({
            message: "Course bookmarked successfully.",
            bookmark: result.rows[0]
        });

    } catch (error) {

        console.error("Add bookmark error:", error);

        res.status(500).json({
            message: "Server error."
        });

    }
});


// ========================================
// REMOVE BOOKMARK
// DELETE /api/bookmarks/:courseId
// ========================================

router.delete("/:courseId", verifyToken, async (req, res) => {

    const courseId = req.params.courseId;

    try {

        const result = await pool.query(
            `DELETE FROM bookmarks
             WHERE user_id = $1
             AND course_id = $2
             RETURNING *`,
            [req.user.userId, courseId]
        );

        if (result.rows.length === 0) {

            return res.status(404).json({
                message: "Bookmark not found."
            });

        }

        res.json({
            message: "Bookmark removed successfully."
        });

    } catch (error) {

        console.error("Remove bookmark error:", error);

        res.status(500).json({
            message: "Server error."
        });

    }
});


module.exports = router;