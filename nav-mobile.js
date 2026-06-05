(function () {
  const toggle = document.querySelector('.nav-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  if (!toggle || !mobileNav) return;

  const closeBtn = mobileNav.querySelector('.mobile-nav-close');
  const backdrop = mobileNav.querySelector('.mobile-nav-backdrop');
  const triggers = mobileNav.querySelectorAll('.mobile-nav-trigger');

  const open = () => {
    mobileNav.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    mobileNav.setAttribute('aria-hidden', 'false');
    document.body.classList.add('nav-open');
    closeBtn?.focus();
  };

  const close = () => {
    mobileNav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    mobileNav.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('nav-open');
    toggle.focus();
  };

  toggle.addEventListener('click', () => {
    mobileNav.classList.contains('open') ? close() : open();
  });

  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileNav.classList.contains('open')) close();
  });

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const group = trigger.closest('.mobile-nav-group');
      const expanded = group.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(expanded));
    });
  });

  mobileNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', close);
  });
})();
