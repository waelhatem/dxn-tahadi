/* Legacy app bridge: app/index.html lives one level below the project root.
   Keep the original app untouched while resolving its shared config/assets from root. */
(function(){
  try {
    if (!document.querySelector('base[data-dxn-root]')) {
      var base=document.createElement('base');
      base.href='/';
      base.setAttribute('data-dxn-root','1');
      document.head.insertBefore(base, document.head.firstChild);
    }
    if (!window.DXN_CONFIG) {
      document.write('<script src="/config.js?v=86.50.1"><\\/script>');
    }
  } catch(e) {
    console.error('DXN legacy config bridge failed',e);
  }
})();
