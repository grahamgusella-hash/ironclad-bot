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
