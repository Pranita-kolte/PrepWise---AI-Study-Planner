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

  // Load the dashboard data
  loadDashboard();

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
        await api.user.updateSettings({ blockedTimes: currentBlockedTimes });
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
    try { await api.user.updateSettings({ blockedTimes: currentBlockedTimes }); } 
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
      renderTasks(tasks);
      updateStats(tasks);
      renderCharts(tasks);
    } catch (error) {
      console.error('Failed to load dashboard', error);
    }
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
        const progress = Math.round((task.schedule.filter(s => s.completed).length / task.schedule.length) * 100) || 0;
        scheduleHtml = `
          <div class="task-schedule">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h5 style="color: var(--primary); font-size: 0.95rem; margin: 0;">📅 Schedule & Progress</h5>
              <span style="font-size: 0.8rem; background: var(--glass-bg); padding: 3px 8px; border-radius: 12px; color: ${progress === 100 ? 'var(--success)' : 'var(--text-main)'}">${progress}% Completed</span>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; margin-bottom: 12px; overflow: hidden;">
              <div style="height: 100%; width: ${progress}%; background: ${progress === 100 ? 'var(--success)' : 'var(--primary)'}; transition: width 0.3s ease;"></div>
            </div>
            <ul style="list-style: none; padding-left: 0; margin-bottom: 15px; font-size: 0.9rem;">
              ${task.schedule.map(s => `
                <li style="margin-bottom: 5px; padding: 8px; background: rgba(0,0,0,0.15); border-radius: 6px; display: flex; align-items: center; gap: 10px; opacity: ${s.completed ? '0.6' : '1'}; transition: opacity 0.2s ease;">
                  <input type="checkbox" class="activity-checkbox" data-task-id="${task._id}" data-activity-id="${s._id}" ${s.completed ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; flex-shrink: 0;">
                  <span style="flex:1; text-decoration: ${s.completed ? 'line-through' : 'none'};"><strong>${s.time}:</strong> ${s.activity}</span>
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

    // Checkbox handlers
    document.querySelectorAll('.activity-checkbox').forEach(box => {
      box.addEventListener('change', async (e) => {
        const taskId = e.target.getAttribute('data-task-id');
        const activityId = e.target.getAttribute('data-activity-id');
        try {
          await api.tasks.toggleActivity(taskId, activityId);
          await loadDashboard();
        } catch (error) {
          console.error('Failed to toggle activity', error);
          e.target.checked = !e.target.checked;
        }
      });
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
    document.getElementById('stat-total').textContent = tasks.length;
    const totalHours = tasks.reduce((sum, task) => sum + task.hours, 0);
    document.getElementById('stat-hours').textContent = totalHours;
  }

  function renderCharts(tasks) {
    const ctx = document.getElementById('difficultyChart').getContext('2d');
    
    // Group tasks by difficulty
    const difficultyCounts = {1:0, 2:0, 3:0, 4:0, 5:0};
    tasks.forEach(t => {
      if(difficultyCounts[t.difficulty] !== undefined) {
        difficultyCounts[t.difficulty]++;
      }
    });

    if (difficultyChart) {
      difficultyChart.destroy();
    }

    difficultyChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'],
        datasets: [{
          data: Object.values(difficultyCounts),
          backgroundColor: [
            '#10b981', '#34d399', '#3b82f6', '#8b5cf6', '#ef4444'
          ],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#f8fafc' }
          }
        }
      }
    });
  }
});
