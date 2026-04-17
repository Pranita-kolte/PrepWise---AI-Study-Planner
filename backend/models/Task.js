const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  name: { type: String, required: true },
  difficulty: { type: Number, default: 3, min: 1, max: 5 },
  deadline_days: { type: Number, required: true },
  hours: { type: Number, required: true },
  completed: { type: Boolean, default: false },
  schedule: [{
    time: { type: String },
    activity: { type: String }
  }],
  tips: [{ type: String }]
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);
module.exports = Task;
