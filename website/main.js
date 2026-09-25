/* 校园宠物乐园 · 官网交互
   只做两件事：导航滚动态、内容入场。其余交给 CSS。 */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- 导航：滚过首屏后浮出毛玻璃底（与产品内顶栏同一行为） --- */
  var nav = document.getElementById('nav');
  if (nav) {
    var ticking = false;
    var sync = function () {
      nav.classList.toggle('is-stuck', window.scrollY > 12);
      ticking = false;
    };
    sync();
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(sync);
    }, { passive: true });
  }

  /* --- 入场：进入视口一次即定格，不来回重播 --- */
  var items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

  items.forEach(function (el) { io.observe(el); });

  /* 首屏元素本就可见，立即播放，避免等一次滚动才出现 */
  window.requestAnimationFrame(function () {
    items.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) el.classList.add('in');
    });
  });
})();
