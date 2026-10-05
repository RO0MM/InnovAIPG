(function(){
'use strict';
const THEME_KEY='innov_theme';
const SOURCE_KEY='innov_theme_source';
const media=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
function valid(v){return v==='dark'||v==='light'}
function manual(){try{const v=localStorage.getItem(THEME_KEY),s=localStorage.getItem(SOURCE_KEY);if(valid(v)&&(s==='manual'||!s)){if(!s)localStorage.setItem(SOURCE_KEY,'manual');return v}}catch(_){}return null}
function system(){return media&&media.matches?'dark':'light'}
function updateButton(button){if(!button)return;const dark=document.documentElement.dataset.theme==='dark';button.classList.toggle('is-dark',dark);button.setAttribute('aria-pressed',String(dark));button.setAttribute('aria-label',dark?'Cambiar a modo claro':'Cambiar a modo oscuro');button.setAttribute('title',dark?'Cambiar a modo claro':'Cambiar a modo oscuro')}
function apply(theme,source){const value=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=value;document.documentElement.dataset.themeSource=source==='manual'?'manual':'system';document.documentElement.style.colorScheme=value;document.querySelectorAll('[data-innov-theme-toggle],#innovThemeToggle,#themeToggle').forEach(updateButton);const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=value==='dark'?'#0b1320':'#121c2b';return value}
function set(theme){const value=theme==='dark'?'dark':'light';try{localStorage.setItem(THEME_KEY,value);localStorage.setItem(SOURCE_KEY,'manual')}catch(_){}return apply(value,'manual')}
function toggle(){return set(document.documentElement.dataset.theme==='dark'?'light':'dark')}
function bindElement(button){if(!button||button.dataset.innovThemeBound==='1')return;button.dataset.innovThemeBound='1';button.setAttribute('data-innov-theme-toggle','1');updateButton(button);button.addEventListener('click',toggle)}
function bindAll(){document.querySelectorAll('[data-innov-theme-toggle],#innovThemeToggle,#themeToggle').forEach(bindElement)}
function init(){const m=manual();apply(m||system(),m?'manual':'system');bindAll()}
window.INNOV_THEME={apply,set,toggle,bindElement,bindAll,current:()=>document.documentElement.dataset.theme||system(),isManual:()=>!!manual()};
init();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindAll,{once:true});
if(media){const follow=e=>{if(!manual())apply(e.matches?'dark':'light','system')};if(media.addEventListener)media.addEventListener('change',follow);else if(media.addListener)media.addListener(follow)}
})();
