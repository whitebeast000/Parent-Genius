const express = require("express");

const router = express.Router()

const pool  = require("../db");

const verifyToken = require("../middleware/verifyToken");


function calculateTier(points) {

    if (points >= 2000) return 5;
    if (points >= 1000) return 4;
    if (points >= 500) return 3;
    if (points >= 200) return 2;

    return 1;
}
// =====================================================
// GET TRAINING PROGRESS
// =====================================================

router.get("/progress", verifyToken, async (req, res) => {

    try {

        const userId = req.user.userId;


        let result = await pool.query(
            `
            SELECT *
            FROM training_progress
            WHERE user_id = $1
            `,
            [userId]
        );


        // Create progress row if user doesn't have one
        if (result.rows.length === 0) {

            result = await pool.query(
                `
                INSERT INTO training_progress
                (user_id, parent_completed, child_completed, tutorials_completed)
                VALUES ($1, 0, 0, 0)
                RETURNING *
                `,
                [userId]
            );

        }


        const progress = result.rows[0];


        res.json({
            success: true,
            training: {
                parent_completed: progress.parent_completed,
                child_completed: progress.child_completed,
                tutorials_completed: progress.tutorials_completed
            }
        });

    }

    catch (error) {

        console.error("Training progress error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load training progress."
        });

    }

});


// =====================================================
// COMPLETE TRAINING ACTIVITY
// =====================================================

router.post("/complete", verifyToken, async (req, res) => {

    try {

        const userId = req.user.userId;

        const { type } = req.body;


        // Only these three types are allowed
        if (!["parent", "child", "tutorial"].includes(type)) {

            return res.status(400).json({
                success: false,
                message: "Invalid training type."
            });

        }


        // Make sure progress row exists
        await pool.query(
            `
            INSERT INTO training_progress (user_id)
            VALUES ($1)
            ON CONFLICT (user_id) DO NOTHING
            `,
            [userId]
        );


        let column;


        if (type === "parent") {
            column = "parent_completed";
        }

        else if (type === "child") {
            column = "child_completed";
        }

        else {
            column = "tutorials_completed";
        }


        const result = await pool.query(
            `
            UPDATE training_progress
            SET ${column} = ${column} + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1
            RETURNING *
            `,
            [userId]
        );


        const progress = result.rows[0];


        res.json({

            success: true,

            message: "Training completed successfully.",

            training: {
                parent_completed: progress.parent_completed,
                child_completed: progress.child_completed,
                tutorials_completed: progress.tutorials_completed
            }

        });

    }

    catch (error) {

        console.error("Training completion error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to complete training."
        });

    }

});


// ============================================================
// GET TRAINING CONTENT
// GET /api/training/:type
//
// type = parent | child | tutorial
// ============================================================
// ============================================================
// GET TRAINING CONTENT
// GET /api/training/:type
// ============================================================

router.get("/:type", verifyToken, async (req, res) => {

    try {

        const { type } = req.params;

        const allowedTypes = [
            "parent",
            "child",
            "tutorial"
        ];

        if (!allowedTypes.includes(type)) {

            return res.status(400).json({
                message: "Invalid training type."
            });

        }

        const result = await pool.query(
            `
            SELECT
                tc.id,
                tc.training_type,
                tc.title,
                tc.description,
                tc.image_url,
                tc.category,
                tc.points,
                tc.content,

                COALESCE(utp.completed, false) AS completed,
                utp.completed_at

            FROM training_content tc

            LEFT JOIN user_training_progress utp
                ON tc.id = utp.training_id
                AND utp.user_id = $1

            WHERE tc.training_type = $2

            ORDER BY tc.id ASC
            `,
            [
                req.user.userId,
                type
            ]
        );

        res.json({
            training: result.rows
        });

    }

    catch (error) {

        console.error(
            "Training loading error:",
            error
        );

        res.status(500).json({
            message: "Server error."
        });

    }

});



// ============================================================
// GET USER TRAINING PROGRESS
// GET /api/training/progress/:type
// ============================================================

router.get(
    "/progress/:type",
    verifyToken,
    async (req, res) => {

        try {

            const { type } = req.params;

            const allowedTypes = [
                "parent",
                "child",
                "tutorial"
            ];

            if (!allowedTypes.includes(type)) {

                return res.status(400).json({
                    message: "Invalid training type."
                });

            }

            const result = await pool.query(
                `
                SELECT
                    tc.id,
                    tc.title,
                    tc.points,
                    utp.completed,
                    utp.completed_at

                FROM training_content tc

                LEFT JOIN user_training_progress utp
                    ON tc.id = utp.training_id
                    AND utp.user_id = $1

                WHERE tc.training_type = $2

                ORDER BY tc.id ASC
                `,
                [
                    req.user.userId,
                    type
                ]
            );


            const total = result.rows.length;

            const completed =
                result.rows.filter(
                    item => item.completed === true
                ).length;


            const percentage =
                total === 0
                    ? 0
                    : Math.round(
                        (completed / total) * 100
                    );


            res.json({

                training: result.rows,

                progress: {

                    total: total,

                    completed: completed,

                    percentage: percentage

                }

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
    }
);


// ============================================================
// COMPLETE TRAINING
// POST /api/training/:id/complete
// ============================================================

router.post(
    "/:id/complete",
    verifyToken,
    async (req, res) => {

        const client = await pool.connect();

        try {

            const userId = req.user.userId;

            const trainingId =
                parseInt(req.params.id);


            if (isNaN(trainingId)) {

                return res.status(400).json({
                    message: "Invalid training ID."
                });

            }


            await client.query("BEGIN");


            // ------------------------------------------------
            // Get training
            // ------------------------------------------------

            const trainingResult = await client.query(
                `
                SELECT
                    id,
                    title,
                    points
                FROM training_content
                WHERE id = $1
                `,
                [trainingId]
            );


            if (trainingResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "Training not found."
                });

            }


            const training =
                trainingResult.rows[0];


            // ------------------------------------------------
            // Check whether already completed
            // ------------------------------------------------

            const existingResult =
                await client.query(
                    `
                    SELECT completed
                    FROM user_training_progress
                    WHERE user_id = $1
                    AND training_id = $2
                    `,
                    [
                        userId,
                        trainingId
                    ]
                );


            if (
                existingResult.rows.length > 0 &&
                existingResult.rows[0].completed === true
            ) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        "Training already completed."
                });

            }


            // ------------------------------------------------
            // Save completion
            // ------------------------------------------------

            await client.query(
                `
                INSERT INTO user_training_progress
                (
                    user_id,
                    training_id,
                    completed,
                    completed_at
                )

                VALUES
                (
                    $1,
                    $2,
                    TRUE,
                    CURRENT_TIMESTAMP
                )

                ON CONFLICT (user_id, training_id)

                DO UPDATE SET
                    completed = TRUE,
                    completed_at = CURRENT_TIMESTAMP
                `,
                [
                    userId,
                    trainingId
                ]
            );


            // ------------------------------------------------
            // ADD POINTS
            // ------------------------------------------------

            const points =
                training.points || 0;


            let progressResult =
                await client.query(
                    `
                    SELECT
                        points,
                        tier
                    FROM user_progress
                    WHERE user_id = $1
                    FOR UPDATE
                    `,
                    [userId]
                );


            if (progressResult.rows.length === 0) {

                progressResult =
                    await client.query(
                        `
                        INSERT INTO user_progress
                        (
                            user_id,
                            points,
                            tier
                        )

                        VALUES
                        (
                            $1,
                            0,
                            1
                        )

                        RETURNING points, tier
                        `,
                        [userId]
                    );

            }


            const currentPoints =
                progressResult.rows[0].points;


            const newPoints =
                currentPoints + points;


            const newTier =
                calculateTier(newPoints);


            await client.query(
                `
                UPDATE user_progress

                SET
                    points = $1,
                    tier = $2

                WHERE user_id = $3
                `,
                [
                    newPoints,
                    newTier,
                    userId
                ]
            );


            await client.query("COMMIT");


            res.json({

                message:
                    "Training completed successfully.",

                training: {

                    id: training.id,

                    title: training.title

                },

                points_earned: points,

                progress: {

                    points: newPoints,

                    tier: newTier

                }

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
    }
);



module.exports = router;