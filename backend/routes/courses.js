const express = require("express");
const router = express.Router();

const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");


// =====================================================
// GET ALL COURSES
// =====================================================

router.get("/", async (req, res) => {
    try {

        const { age, topic, search } = req.query;

        let query = `
            SELECT
                id,
                title,
                topic,
                age_group,
                instructor,
                instructor_title,
                description,
                image_url,
                duration_minutes,
                key_ideas,
                rating,
                total_ratings,
                total_students,
                points,
                created_at
            FROM courses
            WHERE 1=1
        `;

        const values = [];
        let count = 1;


        // Filter by age group
        if (age) {
            query += ` AND age_group = $${count}`;
            values.push(age);
            count++;
        }


        // Filter by topic
        if (topic) {
            query += ` AND topic = $${count}`;
            values.push(topic);
            count++;
        }


        // Search
        if (search) {

            query += `
                AND (
                    title ILIKE $${count}
                    OR description ILIKE $${count}
                    OR topic ILIKE $${count}
                    OR instructor ILIKE $${count}
                )
            `;

            values.push(`%${search}%`);
            count++;
        }


        query += ` ORDER BY created_at DESC`;


        const result = await pool.query(query, values);

        res.json(result.rows);

    } catch (error) {

        console.error("Courses GET error:", error);

        res.status(500).json({
            message: "Failed to load courses"
        });
    }
});


// =====================================================
// GET SINGLE COURSE
// =====================================================

router.get("/:id", async (req, res) => {

    try {

        const { id } = req.params;

        const result = await pool.query(
            `
            SELECT
                id,
                title,
                topic,
                age_group,
                instructor,
                instructor_title,
                description,
                about_topic,
                image_url,
                video_url,
                duration_minutes,
                key_ideas,
                rating,
                total_ratings,
                total_students,
                points,
                created_at
            FROM courses
            WHERE id = $1
            `,
            [id]
        );


        if (result.rows.length === 0) {

            return res.status(404).json({
                message: "Course not found"
            });
        }


        res.json(result.rows[0]);

    } catch (error) {

        console.error("Single course GET error:", error);

        res.status(500).json({
            message: "Failed to load course"
        });
    }
});


// =====================================================
// GET COURSE CHAPTERS
// =====================================================

router.get("/:id/chapters", async (req, res) => {

    try {

        const { id } = req.params;

        const result = await pool.query(
            `
            SELECT
                id,
                course_id,
                chapter_number,
                title,
                description,
                duration_minutes,
                is_free
            FROM course_chapters
            WHERE course_id = $1
            ORDER BY chapter_number
            `,
            [id]
        );


        res.json(result.rows);

    } catch (error) {

        console.error("Course chapters GET error:", error);

        res.status(500).json({
            message: "Failed to load course chapters"
        });
    }
});


// =====================================================
// GET USER COURSE PROGRESS
// =====================================================

router.get("/:id/progress", verifyToken, async (req, res) => {

    try {

        const courseId = req.params.id;
        const userId = req.user.userId;


        const result = await pool.query(
            `
            SELECT
                id,
                course_id,
                completed_chapters,
                current_chapter,
                completed,
                started_at,
                completed_at,
                updated_at
            FROM user_course_progress
            WHERE user_id = $1
            AND course_id = $2
            `,
            [userId, courseId]
        );


        // User has never started this course
        if (result.rows.length === 0) {

            return res.json({
                course_id: Number(courseId),
                completed_chapters: 0,
                current_chapter: 1,
                completed: false
            });
        }


        res.json(result.rows[0]);

    } catch (error) {

        console.error("Course progress GET error:", error);

        res.status(500).json({
            message: "Failed to load course progress"
        });
    }
});


// =====================================================
// START COURSE
// =====================================================

router.post("/:id/start", verifyToken, async (req, res) => {

    try {

        const courseId = req.params.id;
        const userId = req.user.userId;


        // Check course exists
        const course = await pool.query(
            `SELECT id FROM courses WHERE id = $1`,
            [courseId]
        );


        if (course.rows.length === 0) {

            return res.status(404).json({
                message: "Course not found"
            });
        }


        const result = await pool.query(
            `
            INSERT INTO user_course_progress
            (
                user_id,
                course_id,
                completed_chapters,
                current_chapter,
                completed
            )
            VALUES ($1, $2, 0, 1, false)

            ON CONFLICT (user_id, course_id)
            DO UPDATE SET
                updated_at = CURRENT_TIMESTAMP

            RETURNING *
            `,
            [userId, courseId]
        );


        res.status(201).json({
            message: "Course started",
            progress: result.rows[0]
        });

    } catch (error) {

        console.error("Start course error:", error);

        res.status(500).json({
            message: "Failed to start course"
        });
    }
});


// =====================================================
// COMPLETE CHAPTER
// =====================================================

router.post(
    "/:id/chapters/:chapterId/complete",
    verifyToken,
    async (req, res) => {

        const client = await pool.connect();

        try {

            const courseId = Number(req.params.id);
            const chapterId = Number(req.params.chapterId);
            const userId = req.user.userId;


            await client.query("BEGIN");


            // Check chapter
            const chapterResult = await client.query(
                `
                SELECT
                    id,
                    chapter_number
                FROM course_chapters
                WHERE id = $1
                AND course_id = $2
                `,
                [chapterId, courseId]
            );


            if (chapterResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "Chapter not found"
                });
            }


            const chapterNumber =
                chapterResult.rows[0].chapter_number;


            // Count total chapters
            const totalResult = await client.query(
                `
                SELECT COUNT(*)::INTEGER AS total
                FROM course_chapters
                WHERE course_id = $1
                `,
                [courseId]
            );


            const totalChapters = totalResult.rows[0].total;


            // Create progress if it doesn't exist
            await client.query(
                `
                INSERT INTO user_course_progress
                (
                    user_id,
                    course_id,
                    completed_chapters,
                    current_chapter,
                    completed
                )
                VALUES ($1, $2, 0, 1, false)

                ON CONFLICT (user_id, course_id)
                DO NOTHING
                `,
                [userId, courseId]
            );


            // Don't allow chapter count to increase twice
            const currentProgress = await client.query(
                `
                SELECT completed_chapters, completed
                FROM user_course_progress
                WHERE user_id = $1
                AND course_id = $2
                `,
                [userId, courseId]
            );


            const oldCompleted =
                currentProgress.rows[0].completed_chapters;


            // Prevent duplicate completion count
            const alreadyCompleted =
                chapterNumber <= oldCompleted;


            let newCompleted = oldCompleted;

            if (!alreadyCompleted) {
                newCompleted = oldCompleted + 1;
            }


            const courseCompleted =
                newCompleted >= totalChapters;


            const nextChapter =
                courseCompleted
                    ? totalChapters
                    : newCompleted + 1;


            const updateResult = await client.query(
                `
                UPDATE user_course_progress

                SET
                    completed_chapters = $1,
                    current_chapter = $2,
                    completed = $3,
                    completed_at =
                        CASE
                            WHEN $3 = true
                            THEN CURRENT_TIMESTAMP
                            ELSE completed_at
                        END,
                    updated_at = CURRENT_TIMESTAMP

                WHERE user_id = $4
                AND course_id = $5

                RETURNING *
                `,
                [
                    newCompleted,
                    nextChapter,
                    courseCompleted,
                    userId,
                    courseId
                ]
            );


            await client.query("COMMIT");


            res.json({
                message: alreadyCompleted
                    ? "Chapter already completed"
                    : "Chapter completed",

                progress: updateResult.rows[0]
            });

        } catch (error) {

            await client.query("ROLLBACK");

            console.error("Complete chapter error:", error);

            res.status(500).json({
                message: "Failed to complete chapter"
            });

        } finally {

            client.release();
        }
    }
);


// =====================================================
// COURSE FEEDBACK
// =====================================================

router.post("/:id/feedback", verifyToken, async (req, res) => {

    try {

        const courseId = req.params.id;
        const userId = req.user.userId;

        const { helpful, feedback } = req.body;


        if (typeof helpful !== "boolean") {

            return res.status(400).json({
                message: "Helpful value must be true or false"
            });
        }


        // Make sure course exists
        const course = await pool.query(
            `SELECT id FROM courses WHERE id = $1`,
            [courseId]
        );


        if (course.rows.length === 0) {

            return res.status(404).json({
                message: "Course not found"
            });
        }


        const result = await pool.query(
            `
            INSERT INTO course_feedback
            (
                user_id,
                course_id,
                helpful,
                feedback
            )
            VALUES ($1, $2, $3, $4)

            RETURNING *
            `,
            [
                userId,
                courseId,
                helpful,
                feedback || null
            ]
        );


        res.status(201).json({
            message: "Feedback submitted successfully",
            feedback: result.rows[0]
        });

    } catch (error) {

        console.error("Course feedback error:", error);

        res.status(500).json({
            message: "Failed to submit feedback"
        });
    }
});


module.exports = router;