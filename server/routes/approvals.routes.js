const express = require('express');
const router = express.Router();
const approvalService = require('../services/approval.service');

// GET /api/approvals
router.get('/', (req, res) => {
  const { status = 'pending', limit = 50 } = req.query;
  const approvals = approvalService.listApprovals(status, parseInt(limit));
  res.json(approvals);
});

// GET /api/approvals/count
router.get('/count', (req, res) => {
  res.json({ count: approvalService.getPendingCount() });
});

// GET /api/approvals/:id
router.get('/:id', (req, res) => {
  const approval = approvalService.getApprovalById(req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval not found' });
  res.json(approval);
});

// POST /api/approvals/:id/approve
router.post('/:id/approve', async (req, res, next) => {
  try {
    const result = await approvalService.approveAndSend(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/approvals/:id/edit
router.post('/:id/edit', async (req, res, next) => {
  try {
    const { final_reply } = req.body;
    if (!final_reply) return res.status(400).json({ error: 'final_reply is required' });
    const result = await approvalService.editAndSend(req.params.id, final_reply);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/approvals/:id/reject
router.post('/:id/reject', (req, res, next) => {
  try {
    const result = approvalService.rejectApproval(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
