document.addEventListener('DOMContentLoaded', () => {
  // Check auth
  if (!localStorage.getItem('token')) {
    window.location.href = 'index.html';
    return;
  }

  const user = JSON.parse(localStorage.getItem('user'));
  document.getElementById('user-greeting').textContent = `Welcome, ${user.name}`;

  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
  });

  // Chart instances
  let difficultyChart = null;
  let currentLoadedTasks = [];

  // Load the dashboard data
  loadDashboard();

  // Attach theme toggle listener to redraw chart
  const themeToggle = document.getElementById('theme-toggle-btn');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      setTimeout(() => {
        if (currentLoadedTasks.length > 0) renderCharts(currentLoadedTasks);
      }, 50);
    });
  }

  // Handle AI Form Submit
  const aiForm = document.getElementById('ai-task-form');
  const aiInput = document.getElementById('ai-task-input');
  const aiError = document.getElementById('ai-task-error');
  const aiSuccess = document.getElementById('ai-task-success');
  const aiBtn = document.getElementById('ai-task-submit');

  aiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    aiError.textContent = '';
    aiSuccess.textContent = '';
    
    if (!aiInput.value.trim()) return;

    aiBtn.textContent = 'Thinking...';
    aiBtn.disabled = true;

    try {
      await api.tasks.parseAI(aiInput.value);
      aiSuccess.textContent = 'Task successfully added via AI!';
      aiInput.value = '';
      await loadDashboard();
    } catch (error) {
      aiError.textContent = error.message;
    } finally {
      aiBtn.textContent = 'Generate Task (AI)';
      aiBtn.disabled = false;
    }
  });

  // Voice Search / Dictation Logic
  const voiceBtn = document.getElementById('voice-record-btn');
  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;

  if (voiceBtn) {
    voiceBtn.addEventListener('click', async () => {
      if (!isRecording) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
          };

          mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            stream.getTracks().forEach(t => t.stop()); // Stop mic
            
            aiInput.placeholder = 'Transcribing voice...';
            voiceBtn.style.color = 'var(--text-muted)';
            voiceBtn.textContent = '🎤';

            try {
              const res = await api.tasks.transcribeAudio(audioBlob);
              aiInput.value = (aiInput.value ? aiInput.value + ' ' : '') + res.text;
            } catch (err) {
              console.error(err);
              aiError.textContent = 'Failed to transcribe audio. Please try again.';
            } finally {
              aiInput.placeholder = 'e.g. I need to study Math for 5 hours. The difficulty is 4 out of 5 and my deadline is in 7 days.';
            }
          };

          mediaRecorder.start();
          isRecording = true;
          voiceBtn.style.color = 'var(--danger)';
          voiceBtn.textContent = '⏹️';
        } catch (err) {
          console.error('Microphone access disabled', err);
          aiError.textContent = 'Microphone access denied or unavailable.';
        }
      } else {
        mediaRecorder.stop();
        isRecording = false;
      }
    });
  }
  
  // Settings Modal Logic
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettings = document.getElementById('close-settings');
  const addBlockForm = document.getElementById('add-block-form');
  const blockedTimesList = document.getElementById('blocked-times-list');

  let currentBlockedTimes = [];

  const renderBlockedTimes = () => {
    blockedTimesList.innerHTML = currentBlockedTimes.length === 0 ? '<div class="text-muted text-sm">No blocked times added yet.</div>' : '';
    currentBlockedTimes.forEach((block, index) => {
      const el = document.createElement('div');
      el.style.cssText = 'display: flex; justify-content: space-between; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; align-items: center;';
      el.innerHTML = `<span style="font-size: 0.9em;"><strong>${block.day} (${block.type || 'Other'})</strong>: ${block.start} - ${block.end}</span> <button data-index="${index}" class="btn-remove-block" style="background: none; border: none; color: var(--danger); cursor: pointer; font-weight: bold;">✕</button>`;
      blockedTimesList.appendChild(el);
    });

    document.querySelectorAll('.btn-remove-block').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = e.target.getAttribute('data-index');
        currentBlockedTimes.splice(idx, 1);
        renderBlockedTimes();
        try {
            await api.user.updateSettings({ blockedTimes: currentBlockedTimes });
            await loadSchedule();
        } catch(err) { console.error(err); }
      });
    });
  };

  settingsBtn.addEventListener('click', async () => {
    settingsModal.style.display = 'flex';
    try {
      const res = await api.user.getSettings();
      currentBlockedTimes = res.blockedTimes || [];
      renderBlockedTimes();
    } catch(err) { console.error(err); }
  });
  
  closeSettings.addEventListener('click', () => { settingsModal.style.display = 'none'; });

  addBlockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('block-type').value;
    const day = document.getElementById('block-day').value;
    const start = document.getElementById('block-start').value;
    const end = document.getElementById('block-end').value;
    
    currentBlockedTimes.push({ type, day, start, end });
    renderBlockedTimes();
    try { 
        await api.user.updateSettings({ blockedTimes: currentBlockedTimes }); 
        await loadSchedule();
    } 
    catch(err) { console.error(err); }
  });

  // Manual Form Logic
  const difficultySlider = document.getElementById('manual-difficulty');
  const difficultyVal = document.getElementById('manual-difficulty-val');
  if (difficultySlider) {
    difficultySlider.addEventListener('input', (e) => { difficultyVal.textContent = e.target.value; });
  }

  const manualForm = document.getElementById('manual-task-form');
  if (manualForm) {
    manualForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('manual-name').value;
      const difficulty = parseInt(document.getElementById('manual-difficulty').value);
      const deadlineDate = new Date(document.getElementById('manual-deadline').value);
      const hours = parseInt(document.getElementById('manual-hours').value);
      
      const today = new Date();
      if (deadlineDate <= today) {
        alert("Deadline must be in the future!");
        return;
      }
      const diffTime = deadlineDate - today;
      const deadlineDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const submitBtn = document.getElementById('manual-task-submit');
      submitBtn.textContent = 'Generating Algorithmic Plan...';
      submitBtn.disabled = true;

      try {
        await api.tasks.create({ name, difficulty, deadline_days: deadlineDays, hours });
        
        manualForm.reset();
        if (difficultyVal) difficultyVal.textContent = '3';
        await loadDashboard();
      } catch (error) {
        alert(error.message);
      } finally {
        submitBtn.textContent = 'Add Subject';
        submitBtn.disabled = false;
      }
    });
  }

  async function loadDashboard() {
    try {
      const tasks = await api.tasks.getAll();
      currentLoadedTasks = tasks;
      renderTasks(tasks);
      updateStats(tasks);
      renderCharts(tasks);
      checkDeadlines(tasks);
      loadCompletedTasks();
      await loadSchedule();
    } catch (error) {
      console.error('Failed to load dashboard', error);
    }
  }

  async function loadSchedule() {
    try {
      document.getElementById('dynamic-schedule-list').innerHTML = '<div class="text-muted text-center py-4">Generating schedule...</div>';
      const schedule = await api.tasks.getSchedule();
      renderSchedule(schedule);
    } catch (error) {
      console.error('Failed to load schedule', error);
      document.getElementById('dynamic-schedule-list').innerHTML = '<div class="text-danger text-center py-4">Failed to load schedule.</div>';
    }
  }

  function renderSchedule(schedule) {
    const list = document.getElementById('dynamic-schedule-list');
    list.innerHTML = '';
    
    if (!schedule || schedule.length === 0) {
      list.innerHTML = '<div class="text-muted text-center py-4">No tasks to schedule.</div>';
      return;
    }

    // Group by date
    const grouped = {};
    schedule.forEach(slot => {
      if (!grouped[slot.date]) grouped[slot.date] = { day: slot.day, slots: [] };
      grouped[slot.date].slots.push(slot);
    });

    for (const [date, data] of Object.entries(grouped)) {
      const daySection = document.createElement('div');
      daySection.className = 'schedule-day';
      daySection.style.marginBottom = '20px';
      
      daySection.innerHTML = `
        <h3 style="margin-bottom: 10px; color: var(--primary); font-size: 1.1rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 5px;">${data.day}, ${date}</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${data.slots.map(s => `
            <div class="schedule-slot" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-radius: 8px; background: ${s.isRescheduled ? 'rgba(239, 68, 68, 0.15)' : 'var(--glass-bg)'}; border-left: 4px solid ${s.isRescheduled ? 'var(--danger)' : 'var(--primary)'}; border-top: 1px solid var(--glass-border); border-right: 1px solid var(--glass-border); border-bottom: 1px solid var(--glass-border); transition: transform 0.2s;">
              <div>
                <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 4px;">
                  ${s.time} <span style="color: var(--text-muted); font-weight: normal; margin: 0 5px;">|</span> <span class="task-name-span">${s.taskName}</span>
                  ${s.isRescheduled ? '<span style="font-size: 0.7rem; background: var(--danger); color: white; padding: 2px 6px; border-radius: 12px; margin-left: 8px; vertical-align: middle; font-weight: bold;">Rescheduled</span>' : ''}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Session Goal: ${s.activity || 'Complete 1 hour study block'}</div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn-complete-session btn-outline" data-id="${s.taskId}" data-name="${s.taskName}" style="font-size: 0.8rem; padding: 6px 10px; border-color: var(--success); color: var(--success); cursor: pointer;">Complete</button>
                <button class="btn-miss-session btn-outline" data-id="${s.taskId}" style="font-size: 0.8rem; padding: 6px 10px; border-color: var(--danger); color: var(--danger); cursor: pointer;">Missed</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      list.appendChild(daySection);
    }
    
    // Attach handlers
    document.querySelectorAll('.btn-complete-session').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const name = e.currentTarget.getAttribute('data-name');
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = '...';
        try {
          await api.tasks.markComplete(id);
          
          // Local history for completed today panel
          const todayStr = new Date().toLocaleDateString('en-US');
          let history = JSON.parse(localStorage.getItem('completed_history') || '[]');
          history.push({ taskId: id, taskName: name, date: todayStr });
          localStorage.setItem('completed_history', JSON.stringify(history));

          await loadDashboard(); // Re-render everything to update schedule dynamically
        } catch (err) {
          console.error(err);
          e.currentTarget.disabled = false;
          e.currentTarget.textContent = 'Complete';
        }
      });
    });

    document.querySelectorAll('.btn-miss-session').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = '...';
        try {
          await api.tasks.markMissed(id);
          await loadDashboard(); // Re-render everything to update schedule dynamically
        } catch (err) {
          console.error(err);
          e.currentTarget.disabled = false;
          e.currentTarget.textContent = 'Missed';
        }
      });
    });
  }

  function renderTasks(tasks) {
    const list = document.getElementById('tasks-list');
    list.innerHTML = '';

    if (tasks.length === 0) {
      list.innerHTML = '<div class="text-muted text-center py-4">No tasks found. Create one using the AI tool!</div>';
      return;
    }

    tasks.forEach(task => {
      const item = document.createElement('div');
      item.className = 'task-item';
      
      const difficultyStars = '★'.repeat(task.difficulty) + '☆'.repeat(5 - task.difficulty);
      const isUrgent = task.deadline_days <= 2 ? '<span style="color:var(--danger)">Urgent!</span>' : '';

      // Build Schedule HTML
      let scheduleHtml = '';
      if (task.schedule && task.schedule.length > 0) {
        const progress = task.hours > 0 ? Math.round(((task.completed_hours || 0) / task.hours) * 100) : 0;
        const cappedProgress = progress > 100 ? 100 : progress;
        scheduleHtml = `
          <div class="task-schedule">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h5 style="color: var(--primary); font-size: 0.95rem; margin: 0;">📅 Daily Plan (up to Deadline)</h5>
              <span style="font-size: 0.8rem; background: var(--glass-bg); padding: 3px 8px; border-radius: 12px; color: ${cappedProgress === 100 ? 'var(--success)' : 'var(--text-main)'}">${cappedProgress}% Completed</span>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin-bottom: 12px; overflow: hidden;">
              <div style="height: 100%; width: ${cappedProgress}%; background: ${cappedProgress === 100 ? 'var(--success)' : 'var(--primary)'}; transition: width 0.3s ease;"></div>
            </div>
            <ul style="list-style: none; padding-left: 0; margin-bottom: 15px; font-size: 0.9rem;">
              ${task.schedule.map(s => `
                <li style="margin-bottom: 5px; padding: 8px; background: rgba(0,0,0,0.15); border-radius: 6px; display: flex; flex-direction: column; gap: 4px;">
                  <strong style="color: var(--secondary);">${s.time}</strong>
                  <span style="color: var(--text-main);">${s.activity}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        `;
      }

      // Build Tips HTML
      let tipsHtml = '';
      if (task.tips && task.tips.length > 0) {
        tipsHtml = `
          <div class="task-tips">
            <h5 style="color: var(--success); margin-bottom: 8px; font-size: 0.95rem;">💡 Tips & Tricks</h5>
            <ul style="padding-left: 20px; font-size: 0.9rem; color: var(--text-main);">
              ${task.tips.map(t => `<li style="margin-bottom: 4px;">${t}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      item.style.flexDirection = 'column';
      item.style.alignItems = 'flex-start';

      item.innerHTML = `
        <div class="task-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div class="task-info">
            <div style="display: flex; align-items: center; gap: 10px;">
              <h4 style="margin: 0;">${task.name} ${isUrgent}</h4>
              ${task.priority_score ? `<span style="font-size: 0.75rem; background: var(--secondary); color:#fff; padding: 3px 8px; border-radius: 12px; font-weight: bold;">Priority Score: ${task.priority_score.toFixed(1)}</span>` : ''}
            </div>
            <div class="task-meta" style="margin-top: 8px;">
              <span>⌛ ${task.hours} Hours</span>
              <span>📅 Due in ${task.deadline_days} days</span>
              <span style="color:var(--secondary)">🧠 Difficulty: ${difficultyStars}</span>
            </div>
          </div>
          <div class="task-actions" style="display: flex; gap: 10px; align-items: center;">
            ${(task.schedule && task.schedule.length) || (task.tips && task.tips.length) ? `<button class="btn-toggle-details btn-outline" style="padding: 6px 12px; font-size: 0.8rem; border-color: rgba(255,255,255,0.2);">View Plan</button>` : ''}
            <button class="btn-delete" data-id="${task._id}">Remove</button>
          </div>
        </div>
        <div class="task-details" style="display: none; width: 100%; border-top: 1px solid var(--glass-border); padding-top: 15px; margin-top: 15px;">
          ${scheduleHtml}
          ${tipsHtml}
        </div>
      `;

      list.appendChild(item);

      // Add functionality to toggle details
      const toggleBtn = item.querySelector('.btn-toggle-details');
      const detailsDiv = item.querySelector('.task-details');
      if (toggleBtn && detailsDiv) {
        toggleBtn.addEventListener('click', () => {
          if (detailsDiv.style.display === 'none') {
            detailsDiv.style.display = 'block';
            toggleBtn.textContent = 'Hide Plan';
            toggleBtn.style.background = 'rgba(255,255,255,0.1)';
          } else {
            detailsDiv.style.display = 'none';
            toggleBtn.textContent = 'View Plan';
            toggleBtn.style.background = 'transparent';
          }
        });
      }
    });



    // Delete handlers
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        try {
          await api.tasks.delete(id);
          await loadDashboard();
        } catch (error) {
          console.error('Failed to delete task', error);
        }
      });
    });
  }

  function updateStats(tasks) {
    // Total sub-tasks/sessions across all subjects
    const totalTasks = tasks.reduce((sum, task) => sum + task.hours, 0);
    document.getElementById('stat-total').textContent = totalTasks;
    
    // Remaining sub-tasks/sessions
    const remainingTasks = tasks.reduce((sum, task) => {
        const left = task.hours - (task.completed_hours || 0);
        return sum + (left > 0 ? left : 0);
    }, 0);
    if (document.getElementById('stat-remaining')) document.getElementById('stat-remaining').textContent = remainingTasks;

    // Repurpose the hours card to show Total Subjects
    if (document.getElementById('stat-hours')) {
        const hoursCardTitle = document.getElementById('stat-hours').parentElement.querySelector('h3');
        if (hoursCardTitle) hoursCardTitle.textContent = "Total Subjects";
        document.getElementById('stat-hours').textContent = tasks.length;
    }
  }

  function renderCharts(tasks) {
    const ctx = document.getElementById('difficultyChart').getContext('2d');
    
    // Dynamic styling based on current theme
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#f8fafc';
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--glass-border').trim() || 'rgba(255, 255, 255, 0.1)';

    if (difficultyChart) {
      difficultyChart.destroy();
    }

    difficultyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: tasks.map(t => t.name),
        datasets: [
          {
            label: 'Completed Sessions',
            data: tasks.map(t => t.completed_hours || 0),
            backgroundColor: '#10b981', // Success color
            borderRadius: 4
          },
          {
            label: 'Remaining Sessions',
            data: tasks.map(t => Math.max(0, t.hours - (t.completed_hours || 0))),
            backgroundColor: '#3b82f6', // Primary color
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            ticks: { color: textColor },
            grid: { color: gridColor, drawBorder: false }
          },
          y: {
            stacked: true,
            ticks: { color: textColor, stepSize: 1 },
            grid: { color: gridColor, drawBorder: false }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { weight: 'bold' } }
          },
          tooltip: {
            callbacks: {
              afterBody: function(context) {
                const idx = context[0].dataIndex;
                return '(Priority Score: ' + tasks[idx].priority_score.toFixed(1) + ')';
              }
            }
          }
        }
      }
    });
  }

  function checkDeadlines(tasks) {
    // Only tasks not yet fully completed
    const approaching = tasks.filter(t => t.deadline_days <= 3 && t.hours > (t.completed_hours || 0));
    let container = document.getElementById('deadline-reminders');
    if (!container) return;
    
    if (approaching.length > 0) {
      container.style.display = 'block';
      container.innerHTML = `<h3 style="color: var(--danger); font-size: 1.1rem; margin-bottom: 10px;">⚠️ Upcoming Deadlines</h3>` + approaching.map(t => `
        <div class="glass-panel" style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.4); padding: 12px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: var(--text-main); font-size: 0.95rem;">${t.name}</strong> 
          <span style="color: var(--danger); font-weight: bold; font-size: 0.9rem;">Deadline in ${t.deadline_days} days!</span>
        </div>
      `).join('');
    } else {
      container.style.display = 'none';
      container.innerHTML = '';
    }
  }

  function loadCompletedTasks() {
    const todayStr = new Date().toLocaleDateString('en-US');
    let history = JSON.parse(localStorage.getItem('completed_history') || '[]');
    let todaysTasks = history.filter(h => h.date === todayStr);

    let list = document.getElementById('completed-today-list');
    if (!list) return;

    if (todaysTasks.length === 0) {
      list.innerHTML = '<div class="text-muted text-sm mt-2">No tasks completed yet.</div>';
    } else {
      list.innerHTML = todaysTasks.map(t => `
        <div style="padding: 10px; background: rgba(16, 185, 129, 0.1); border-left: 3px solid var(--success); border-radius: 6px; color: var(--text-main);">
          ✅ <strong>${t.taskName}</strong> - 1 Hr
        </div>
      `).join('');
    }
  }
});
