document.addEventListener('DOMContentLoaded', () => {
  const currentTheme = localStorage.getItem('theme') || 'dark';
  if (currentTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) {
    // Optionally set initial icon
    toggleBtn.textContent = '🌙';

    toggleBtn.addEventListener('click', () => {
      let theme = document.documentElement.getAttribute('data-theme');
      let newTheme = theme === 'light' ? 'dark' : 'light';
      
      if (newTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }

      localStorage.setItem('theme', newTheme);
      toggleBtn.textContent = '🌙';
    });
  }
});
