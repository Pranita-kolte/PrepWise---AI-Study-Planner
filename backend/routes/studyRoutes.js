const express = require('express');
const Task = require('../models/Task');
const { protect } = require('../middleware/auth');
const { Groq } = require('groq-sdk');

const router = express.Router();
const client = new Groq({ apiKey: process.env.GROQ_API_KEY }); // Ensure to set this in .env

// Get all tasks for logged in user
router.get('/tasks', protect, async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a solid task
router.post('/tasks', protect, async (req, res) => {
  const { name, difficulty, deadline_days, hours } = req.body;

  try {
    const task = new Task({
      user: req.user._id,
      name,
      difficulty: difficulty || 3,
      deadline_days,
      hours: hours || 5
    });
    const createdTask = await task.save();
    res.status(201).json(createdTask);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Parse natural language using Groq and create a task
router.post('/parse_task', protect, async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ message: 'No text provided' });
  }

  const prompt = `
  The user wants to add a study task based on this natural language request: "${text}"
  Extract and generate the following information, outputting strictly as a JSON object:
  - "name": string (the name of the subject or task)
  - "difficulty": integer from 1 to 5 (assume 3 if not specified)
  - "deadline_days": integer (number of days until the deadline, from today. Assume 7 if not specified)
  - "hours": integer (estimated total study hours required, assume 5 if not specified)
  - "schedule": array of objects, containing a logical breakdown of study sessions fitting the hours and days. Each object should have:
      * "time": string (e.g., "Day 1 - Morning", "Day 2 - Evening")
      * "activity": string (detailed description of what exactly to study/do)
  - "tips": array of strings, providing 3 specific study tips or tricks related to this subject/task to help them prepare faster.
  Output ONLY valid JSON, without any markdown formatting wrappers or additional text.
  `;

  try {
    const chatCompletion = await client.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a specialized AI designed to extract structured JSON data from text. Always return valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      model: "llama-3.3-70b-versatile",
      temperature: 0.1
    });

    let responseText = chatCompletion.choices[0].message.content.trim();
    if (responseText.startsWith("\`\`\`json")) {
      responseText = responseText.substring(7);
    }
    if (responseText.endsWith("\`\`\`")) {
      responseText = responseText.substring(0, responseText.length - 3);
    }

    const parsedData = JSON.parse(responseText);

    const task = new Task({
      user: req.user._id,
      name: parsedData.name,
      difficulty: parsedData.difficulty || 3,
      deadline_days: parsedData.deadline_days,
      hours: parsedData.hours || 5,
      schedule: parsedData.schedule || [],
      tips: parsedData.tips || []
    });

    const createdTask = await task.save();
    res.status(201).json(createdTask);

  } catch (error) {
    res.status(500).json({ message: 'Failed to parse task', error: error.message });
  }
});

// Delete task
router.delete('/tasks/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if the user owns the task
    if (task.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    await task.deleteOne();
    res.json({ message: 'Task removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
