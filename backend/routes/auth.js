const express = require('express');
const router = express.Router();
const { login, register, me, logout, listUsers, updateUser, deleteUser } = require('../controllers/authController');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/role');

router.post('/login', login);
router.post('/register', register);
router.get('/me', auth, me);
router.post('/logout', logout);

// Admin-only user management
router.get('/users', auth, requireRole('admin'), listUsers);
router.put('/users/:id', auth, requireRole('admin'), updateUser);
router.delete('/users/:id', auth, requireRole('admin'), deleteUser);

module.exports = router;
