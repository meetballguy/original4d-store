    let lastFocus;
    function openNav(){
      lastFocus=document.activeElement;
      document.getElementById('sidenav').classList.add('open');
      document.getElementById('sidenav').setAttribute('aria-hidden','false');
      document.getElementById('backdrop').classList.add('show');
      document.getElementById('backdrop').setAttribute('aria-hidden','false');
      document.body.style.overflow='hidden';
    }
    function closeNav(){
      document.getElementById('sidenav').classList.remove('open');
      document.getElementById('sidenav').setAttribute('aria-hidden','true');
      document.getElementById('backdrop').classList.remove('show');
      document.getElementById('backdrop').setAttribute('aria-hidden','true');
      document.body.style.overflow='';
      if(lastFocus){try{lastFocus.focus();}catch(e){}}
    }
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ closeNav(); }});
