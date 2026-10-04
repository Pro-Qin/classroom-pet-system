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

  /* --- 宣传片：到点把 B 站播放器挂上来 -----------------------------------
     页面里只有 data-release-at 和 data-bvid 两个属性要改。
     到点之前显示倒计时卡片；到点后把 data-src 换成 src、撤掉 hidden，
     iframe 才开始真的去加载 B 站播放器（不在页面加载时就预载，省流量也不卡首屏）。 */
  var fe = document.getElementById('film-embed');
  if (fe) {
    var bvid = (fe.getAttribute('data-bvid') || '').trim();
    var at = Date.parse(fe.getAttribute('data-release-at') || '');
    var frame = document.getElementById('film-frame');
    var soon = document.getElementById('film-soon');
    var clock = document.getElementById('film-clock');
    var ready = !isNaN(at) && Date.now() >= at;   // 没有时间戳就当作"到点"

    var arm = function () {
      if (!frame || frame.getAttribute('src')) return;      // 只挂一次
      if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) return;        // bvid 还没填，宁可空着也不挂坏播放器
      frame.setAttribute('src',
        'https://player.bilibili.com/player.html?bvid=' + bvid +
        '&page=1&autoplay=0&danmaku=0&high_quality=1&as_wide=1');
      frame.hidden = false;
      if (soon) soon.hidden = true;
      fe.classList.add('is-live');
    };

    var tick = function () {
      if (!isNaN(at) && Date.now() >= at) { arm(); return true; }
      if (clock && !isNaN(at)) {
        var left = Math.max(0, at - Date.now());
        var d = Math.floor(left / 864e5), h = Math.floor(left % 864e5 / 36e5), m = Math.floor(left % 36e5 / 6e4);
        var s = Math.floor(left % 6e4 / 1000);
        clock.textContent = d > 0
          ? d + ' 天 ' + h + ' 小时后上线'
          : (h > 0 ? h + ' 小时 ' + m + ' 分后上线' : m + ' 分 ' + s + ' 秒后上线');
      }
      return false;
    };

    if (ready || tick()) arm();
    else {
      var timer = window.setInterval(function () { if (tick()) window.clearInterval(timer); }, 1000);
      // 后台标签页的定时器会被节流，回到前台时立刻补一次判定
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && tick()) window.clearInterval(timer);
      });
    }
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
