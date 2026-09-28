if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const button = document.getElementById('push-toggle');
    const status = document.getElementById('push-status');
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      if (!button) return;
      if (!('PushManager' in window) || !('Notification' in window)) {
        status.textContent = 'This browser does not support phone notifications.';
        button.disabled = true;
        return;
      }
      async function send(action, subscription) {
        const fields = new URLSearchParams({ action, guildId: button.dataset.guild,
          csrf: button.dataset.csrf, subscription: JSON.stringify(subscription) });
        const response = await fetch('/push', { method: 'POST', body: fields, credentials: 'same-origin' });
        if (!response.ok) throw new Error('Could not save your notification preference. Sign in again and retry.');
        return response.json();
      }
      function display(subscribed) {
        button.dataset.subscribed = subscribed ? 'yes' : 'no';
        button.textContent = subscribed ? 'Turn off notifications on this phone' : 'Enable notifications on this phone';
        status.textContent = subscribed ? 'Alerts are on for this server.' : 'Alerts are off for this server.';
      }
      const current = await registration.pushManager.getSubscription();
      if (current) display((await send('status', current.toJSON())).subscribed);
      else display(false);
      button.addEventListener('click', async () => {
        button.disabled = true;
        status.textContent = 'Updating notifications…';
        try {
          if (button.dataset.subscribed === 'yes') {
            const subscription = await registration.pushManager.getSubscription();
            if (!subscription) throw new Error('No phone subscription found. Reload and try again.');
            await send('unsubscribe', subscription.toJSON());
            display(false);
          } else {
            if (Notification.permission === 'denied') throw new Error('Allow notifications for this site in your phone settings.');
            if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted')
              throw new Error('Phone notification permission was not granted.');
            let subscription = await registration.pushManager.getSubscription();
            subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true,
              applicationServerKey: button.dataset.key });
            await send('subscribe', subscription.toJSON());
            display(true);
          }
        } catch (error) { status.textContent = error.message || 'Could not enable notifications.'; }
        finally { button.disabled = false; }
      });
    } catch (error) {
      if (status) status.textContent = 'Phone notifications could not start. Try reloading.';
    }
  });
}

// Keep server overview, ticket list, and individual ticket conversations fresh.
(() => {
  const ticketDetail = /^\/g\/\d+\/tickets\/\d+$/.test(location.pathname);
  const livePage = ticketDetail || location.pathname === '/' || /^\/g\/\d+(?:\/tickets)?$/.test(location.pathname);
  if (!livePage) return;

  let checking = false;
  const editing = () => {
    const el = document.activeElement;
    return el && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName);
  };

  function replaceTicketMessages(nextMain, currentMain) {
    const currentMessages = [...currentMain.querySelectorAll('.message')];
    const nextMessages = [...nextMain.querySelectorAll('.message')];
    const currentSignature = currentMessages.map(node => node.innerHTML).join('\n');
    const nextSignature = nextMessages.map(node => node.innerHTML).join('\n');
    if (currentSignature === nextSignature) return;

    const firstMessage = currentMessages[0];
    const anchor = firstMessage || currentMain.querySelector('hr.divider');
    if (!anchor) return;

    currentMessages.forEach(node => node.remove());
    nextMessages.forEach(node => anchor.parentNode.insertBefore(node.cloneNode(true), anchor));
  }

  async function refreshIfChanged() {
    if (checking || document.visibilityState !== 'visible') return;
    if (!ticketDetail && editing()) return;
    checking = true;
    try {
      const response = await fetch(`${location.pathname}${location.search}${location.search ? '&' : '?'}_=${Date.now()}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-Ironclad-Refresh': '1' }
      });
      if (!response.ok) return;
      const html = await response.text();
      const nextMain = new DOMParser().parseFromString(html, 'text/html').querySelector('main');
      const currentMain = document.querySelector('main');
      if (!nextMain || !currentMain) return;

      if (ticketDetail) replaceTicketMessages(nextMain, currentMain);
      else if (nextMain.innerHTML !== currentMain.innerHTML) currentMain.innerHTML = nextMain.innerHTML;
    } catch (_) {
      // Temporary network issues should not interrupt the dashboard.
    } finally {
      checking = false;
    }
  }

  refreshIfChanged();
  setInterval(refreshIfChanged, 1000);
})();
