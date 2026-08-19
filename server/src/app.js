require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const apiRoutes = require('./routes/api');
const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
    res.send('Email Sender API is running');
});

// Global error handler to prevent HTML 500 error pages
app.use((err, req, res, next) => {
    console.error('Express Global Error:', err);
    res.status(500).json({ error: 'Server crashed: ' + err.message });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
