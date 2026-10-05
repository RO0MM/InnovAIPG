(function(){
  try{
    var saved=localStorage.getItem('innov_admin_theme_choice');
    var theme=saved || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme=theme;
    document.documentElement.style.colorScheme=theme;
  }catch(_){ }
})();
