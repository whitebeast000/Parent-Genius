const express = require("express");
const router = express.Router();

const pool = require("../db");
const verifyToken = require("../middleware/verifyToken");


// ==========================================
// GET ALL RESOURCES
// GET /api/resources
// ==========================================

router.get("/", async (req, res) => {

    try {

        const result = await pool.query(`
            SELECT
                id,
                title,
                author,
                description,
                price,
                old_price,
                image_url,
                created_at
            FROM resources
            ORDER BY id ASC
        `);

        res.json({
            resources: result.rows
        });

    } catch (error) {

        console.error("Resources GET error:", error);

        res.status(500).json({
            message: "Failed to load resources."
        });

    }

});


// ==========================================
// GET SINGLE RESOURCE
// GET /api/resources/:id
// ==========================================

router.get("/:id", async (req, res) => {

    try {

        const resourceId = parseInt(req.params.id);

        if (isNaN(resourceId)) {

            return res.status(400).json({
                message: "Invalid resource ID."
            });

        }

        const result = await pool.query(
            `
            SELECT
                id,
                title,
                author,
                description,
                price,
                old_price,
                image_url,
                created_at
            FROM resources
            WHERE id = $1
            `,
            [resourceId]
        );

        if (result.rows.length === 0) {

            return res.status(404).json({
                message: "Resource not found."
            });

        }

        res.json({
            resource: result.rows[0]
        });

    } catch (error) {

        console.error("Resource GET error:", error);

        res.status(500).json({
            message: "Failed to load resource."
        });

    }

});



// ============================================================
// ORDER RESOURCE
// POST /api/resources/:id/order
// ============================================================

router.post("/:id/order", verifyToken, async (req, res) => {

    try {

        const resourceId = parseInt(req.params.id);
        const userId = req.user.userId;

        if (isNaN(resourceId)) {
            return res.status(400).json({
                message: "Invalid resource ID."
            });
        }

        // Check resource exists
        const resourceResult = await pool.query(
            `SELECT id, title, price
             FROM resources
             WHERE id = $1`,
            [resourceId]
        );

        if (resourceResult.rows.length === 0) {
            return res.status(404).json({
                message: "Resource not found."
            });
        }

        const resource = resourceResult.rows[0];

        // Check if already ordered
        const existingOrder = await pool.query(
            `SELECT id
             FROM resource_orders
             WHERE user_id = $1
             AND resource_id = $2
             AND status != 'cancelled'`,
            [userId, resourceId]
        );

        if (existingOrder.rows.length > 0) {
            return res.status(400).json({
                message: "You have already ordered this resource."
            });
        }

        // Create order
        const result = await pool.query(
            `INSERT INTO resource_orders
             (user_id, resource_id, price)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [
                userId,
                resourceId,
                resource.price
            ]
        );

        res.status(201).json({
            message: "Resource ordered successfully.",
            order: result.rows[0]
        });

    } catch (error) {

        console.error("Resource order error:", error);

        res.status(500).json({
            message: "Failed to place order."
        });
    }
});


// ============================================================
// START FREE TRIAL
// POST /api/resources/:id/trial
// ============================================================

router.post("/:id/trial", verifyToken, async (req, res) => {

    try {

        const resourceId = parseInt(req.params.id);
        const userId = req.user.userId;

        if (isNaN(resourceId)) {
            return res.status(400).json({
                message: "Invalid resource ID."
            });
        }

        // Check resource exists
        const resourceResult = await pool.query(
            `SELECT id, title
             FROM resources
             WHERE id = $1`,
            [resourceId]
        );

        if (resourceResult.rows.length === 0) {
            return res.status(404).json({
                message: "Resource not found."
            });
        }

        // Check whether trial already exists
        const existingTrial = await pool.query(
            `SELECT *
             FROM resource_trials
             WHERE user_id = $1
             AND resource_id = $2`,
            [userId, resourceId]
        );

        if (existingTrial.rows.length > 0) {
            return res.status(400).json({
                message: "You have already started the free trial."
            });
        }

        // Create trial
        const result = await pool.query(
            `INSERT INTO resource_trials
             (user_id, resource_id)
             VALUES ($1, $2)
             RETURNING *`,
            [userId, resourceId]
        );

        res.status(201).json({
            message: "Free trial started successfully.",
            trial: result.rows[0]
        });

    } catch (error) {

        console.error("Free trial error:", error);

        res.status(500).json({
            message: "Failed to start free trial."
        });
    }
});

module.exports = router;