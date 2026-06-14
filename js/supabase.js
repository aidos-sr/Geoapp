import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const config = Object.freeze({
  url: document.querySelector('meta[name="supabase-url"]')?.content.trim() || '',
  anonKey: document.querySelector('meta[name="supabase-anon-key"]')?.content.trim() || ''
});

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url) || !config.anonKey) {
  console.error('Supabase is not configured. Fill supabase-url and supabase-anon-key in index.html.');
  setTimeout(() => {
    if (typeof showAuthScreen === 'function') showAuthScreen();
    const error = document.getElementById('authErr');
    if (error) error.textContent = 'Supabase баптауларын index.html файлына енгізіңіз.';
  }, 0);
} else {
  const supabase = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  window._supabase = supabase;
  window._fbDb = supabase;

  window.uploadToCourseStorage = async function(file, onProgress) {
    await window.validateImageFile(file);
    if (!window._fbUser?.isAdmin) throw new Error('Administrator access required');
    if (onProgress) onProgress(10);
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${window._fbUser.uid}/${crypto.randomUUID()}.${extension || 'jpg'}`;
    const {error} = await supabase.storage.from('course-images').upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false
    });
    if (error) throw error;
    if (onProgress) onProgress(100);
    const {data} = supabase.storage.from('course-images').getPublicUrl(path);
    return {url: data.publicUrl, source: 'supabase'};
  };

  async function loadProfile(user) {
    const {data, error} = await supabase
      .from('profiles')
      .select('id,email,login,class_name,role,enrolled')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.enrolled) return null;
    return {
      uid: user.id,
      email: user.email || data.email,
      login: data.login,
      cls: data.class_name,
      isAdmin: data.role === 'admin'
    };
  }

  let handledUserId = null;
  function startAppSession(profile) {
    if (typeof startSession === 'function') {
      startSession(profile);
      return;
    }
    setTimeout(() => startAppSession(profile), 25);
  }

  async function handleSession(session) {
    const user = session?.user;
    if (!user) {
      handledUserId = null;
      window._fbUser = null;
      if (typeof showAuthScreen === 'function') showAuthScreen();
      return;
    }
    if (!user.email_confirmed_at) {
      window._fbUser = null;
      if (typeof showAuthScreen === 'function') showAuthScreen();
      return;
    }
    try {
      const profile = await loadProfile(user);
      if (!profile) {
        await supabase.auth.signOut();
        const error = document.getElementById('authErr');
        if (error) error.textContent = 'Бұл аккаунт курсқа тіркелмеген.';
        return;
      }
      window._fbUser = profile;
      if (handledUserId !== user.id) {
        handledUserId = user.id;
        startAppSession(profile);
      }
    } catch (error) {
      console.error('Supabase session:', error);
      if (typeof showAuthScreen === 'function') showAuthScreen();
    }
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => handleSession(session), 0);
  });
  supabase.auth.getSession().then(({data}) => handleSession(data.session));
}
