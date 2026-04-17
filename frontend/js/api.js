// API Configurations
const API_URL = 'http://localhost:5000/api';

const fetchWrapper = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401 && window.location.pathname.includes('dashboard.html')) {
        // Token expired or invalid
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    }
    throw new Error(data.message || 'Something went wrong');
  }

  return data;
};

const api = {
  auth: {
    login: (credentials) => fetchWrapper('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }),
    register: (userData) => fetchWrapper('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    })
  },
  user: {
    getSettings: () => fetchWrapper('/auth/settings'),
    updateSettings: (settings) => fetchWrapper('/auth/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    })
  },
  tasks: {
    getAll: () => fetchWrapper('/study/tasks'),
    create: (taskData) => fetchWrapper('/study/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    }),
    delete: (id) => fetchWrapper(`/study/tasks/${id}`, {
      method: 'DELETE'
    }),
    parseAI: (text) => fetchWrapper('/study/parse_task', {
      method: 'POST',
      body: JSON.stringify({ text })
    }),
    toggleActivity: (taskId, activityId) => fetchWrapper(`/study/tasks/${taskId}/activity/${activityId}`, {
      method: 'PUT'
    })
  }
};
