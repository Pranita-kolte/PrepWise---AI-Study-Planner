const express = require('express');
const Task = require('../models/Task');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { Groq } = require('groq-sdk');
const { generateDeterministicSchedule } = require('../utils/schedulerEngine');
const multer = require('multer');
const upload = multer();
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();
const client = new Groq({ apiKey: process.env.GROQ_API_KEY }); // Ensure to set this in .env

// Get all tasks for logged in user
router.get('/tasks', protect, async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user._id }).sort({ priority_score: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a solid task
router.post('/tasks', protect, async (req, res) => {
  const { name, difficulty, deadline_days, hours } = req.body;

  try {
    const userPref = await User.findById(req.user._id);

    let schedule = [];
    let tips = [];

    // Attempt to generate a schedule and tips dynamically so "View Plan" works
    try {
      const prompt = `
      The user is adding a study task manually with the following details: 
      Subject: "${name}", Difficulty: ${difficulty || 3}/5, Deadline: ${deadline_days} days, Total Hours: ${hours || 5}.
      Generate the following information, outputting strictly as a JSON object:
      - "schedule": array of objects, providing a daily plan. Strictly generate EXACTLY as many objects as ${deadline_days} (one per day). Each object should have:
          * "time": string (format as "Day 1", "Day 2", etc.)
          * "activity": string (highly precise and in-depth breakdown of the specific concepts, sub-topics, or chapters to cover during this session block)
      - "tips": array of strings, providing 3 specific study tips or tricks related to "${name}".
      Output ONLY valid JSON, without any markdown formatting wrappers or additional text.
      `;

      const chatCompletion = await client.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a specialized AI designed to generate structured JSON data from task details. Always return valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        model: "llama-3.3-70b-versatile",
        temperature: 0.2
      });

      let responseText = chatCompletion.choices[0].message.content.trim();
      if (responseText.startsWith("\`\`\`json")) {
        responseText = responseText.substring(7);
      }
      if (responseText.endsWith("\`\`\`")) {
        responseText = responseText.substring(0, responseText.length - 3);
      }
      const parsedData = JSON.parse(responseText);
      if (parsedData.schedule) schedule = parsedData.schedule;
      if (parsedData.tips) tips = parsedData.tips;
    } catch (aiError) {
      console.warn("AI Plan generation failed for manual task:", aiError);
    }

    const task = new Task({
      user: req.user._id,
      name,
      difficulty: difficulty || 3,
      deadline_days,
      hours: hours || 5,
      schedule,
      tips
    });
    
    // Compute Priority Score
    const dDays = task.deadline_days > 0 ? task.deadline_days : 1;
    task.priority_score = (task.difficulty * task.hours) / dDays;
    
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
  - "schedule": array of objects, providing a daily plan. Strictly generate EXACTLY as many objects as "deadline_days". (e.g., if deadline_days is 5, generate exactly 5 objects). Each object should have:
      * "time": string (format as "Day 1", "Day 2", etc. up to the deadline day)
      * "activity": string (highly precise and in-depth breakdown of the specific concepts, sub-topics, or chapters to cover during this session block)
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

    // Compute Priority Score
    const dDays = task.deadline_days > 0 ? task.deadline_days : 1;
    task.priority_score = (task.difficulty * task.hours) / dDays;

    const createdTask = await task.save();
    res.status(201).json(createdTask);

  } catch (error) {
    res.status(500).json({ message: 'Failed to parse task', error: error.message });
  }
});

// Transcribe Audio
router.post('/transcribe', protect, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No audio file provided' });
    }

    const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.webm`);
    fs.writeFileSync(tempFilePath, req.file.buffer);

    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-large-v3",
      response_format: "json",
    });

    // Cleanup
    fs.unlinkSync(tempFilePath);

    res.json({ text: transcription.text });
  } catch (error) {
    res.status(500).json({ message: 'Failed to transcribe audio', error: error.message });
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

// Global algorithmic schedule
router.get('/schedule', protect, async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user._id });
    const userPref = await User.findById(req.user._id);
    
    // Update priorities dynamically
    for (let task of tasks) {
      const dDays = task.deadline_days > 0 ? task.deadline_days : 1;
      let basePriority = (task.difficulty * task.hours) / dDays;
      task.priority_score = basePriority + (task.missed_sessions * 1.5);
      await task.save();
    }
    
    const timeline = generateDeterministicSchedule(tasks, userPref.blockedTimes || []);
    res.json(timeline);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark session missed
router.post('/tasks/:id/miss', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.user.toString() !== req.user._id.toString()) return res.status(401).json({ message: 'Not authorized' });

    task.missed_sessions += 1;
    await task.save();
    res.json({ message: 'Session missed, priority updated', task });
  } catch(err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark session complete
router.post('/tasks/:id/complete', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.user.toString() !== req.user._id.toString()) return res.status(401).json({ message: 'Not authorized' });

    task.completed_hours += 1;
    await task.save();
    res.json({ message: 'Session completed', task });
  } catch(err) {
    res.status(500).json({ message: err.message });
  }
});

// Toggle Activity Complete Status
router.put('/tasks/:id/activity/:activityId', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.user.toString() !== req.user._id.toString()) return res.status(401).json({ message: 'Not authorized' });

    const activity = task.schedule.id(req.params.activityId);
    if (!activity) return res.status(404).json({ message: 'Activity not found' });

    // Toggle completed state
    activity.completed = !activity.completed;

    // Recalculate completed tracking
    const totalAct = task.schedule.length;
    const compAct = task.schedule.filter(a => a.completed).length;
    
    if (totalAct > 0) {
      // Intelligently map progress to completed hours
      task.completed_hours = Math.round(task.hours * (compAct / totalAct));
    }

    // Recompute priority based on remaining effort
    const dDays = task.deadline_days > 0 ? task.deadline_days : 1;
    let basePriority = (task.difficulty * task.hours) / dDays;
    task.priority_score = basePriority + (task.missed_sessions * 1.5);

    await task.save();
    res.json({ message: 'Activity toggled', task });
  } catch(err) {
    res.status(500).json({ message: err.message });
  }
});
