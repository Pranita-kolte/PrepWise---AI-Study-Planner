document.addEventListener('DOMContentLoaded', () => {
  // Check if already logged in
  if (localStorage.getItem('token') && window.location.pathname.endsWith('index.html')) {
    window.location.href = 'dashboard.html';
  }

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const showLoginBtn = document.getElementById('show-login');
  const showRegisterBtn = document.getElementById('show-register');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');

  // Toggle Forms
  if (showLoginBtn && showRegisterBtn) {
    showLoginBtn.addEventListener('click', () => {
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
      showLoginBtn.classList.add('active');
      showRegisterBtn.classList.remove('active');
    });

    showRegisterBtn.addEventListener('click', () => {
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
      showRegisterBtn.classList.add('active');
      showLoginBtn.classList.remove('active');
    });
  }

  // Handle Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.textContent = '';
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        const data = await api.auth.login({ email, password });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify({ id: data._id, name: data.name, email: data.email }));
        window.location.href = 'dashboard.html';
      } catch (err) {
        loginError.textContent = err.message;
      }
    });
  }

  // Handle Register
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      registerError.textContent = '';
      const name = document.getElementById('register-name').value;
      const email = document.getElementById('register-email').value;
      const password = document.getElementById('register-password').value;

      try {
        const data = await api.auth.register({ name, email, password });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify({ id: data._id, name: data.name, email: data.email }));
        window.location.href = 'dashboard.html';
      } catch (err) {
        registerError.textContent = err.message;
      }
    });
  }
});
