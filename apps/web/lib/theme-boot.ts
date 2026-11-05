// Server-safe: inlined in <head> so a saved theme applies before first paint (no flash).
export const THEME_BOOT = `try{var t=localStorage.getItem("whitepay.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`
