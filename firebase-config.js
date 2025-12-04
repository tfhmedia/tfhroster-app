try {
    console.log('firebase-config.js loading...');
    console.log('Checking firebase object...');
    console.log('typeof firebase:', typeof firebase);
    console.log('window.firebase:', window.firebase);

    console.log('Checking loaded scripts:');
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
        console.log(`Script ${i}: src=${scripts[i].src}`);
    }

    if (typeof firebase === 'undefined') {
        throw new Error('Firebase SDK not loaded!');
    }
    console.log('Firebase SDK version:', firebase.SDK_VERSION);

    const firebaseConfig = {
        apiKey: "AIzaSyBEzDAGW6f1XH6lgujMuM988hneXvvfkQ0",
        authDomain: "gen-lang-client-0371720740.firebaseapp.com",
        projectId: "gen-lang-client-0371720740",
        storageBucket: "gen-lang-client-0371720740.firebasestorage.app",
        messagingSenderId: "846082557329",
        appId: "1:846082557329:web:ce3495fd291e2437494630",
        measurementId: "G-Q6XXH4PPFN"
    };

    // Initialize Firebase (using compat SDK)
    if (!firebase.apps.length) {
        console.log('Initializing Firebase app...');
        firebase.initializeApp(firebaseConfig);
    } else {
        console.log('Firebase app already initialized');
    }

    // Initialize services
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Export for use in other files
    window.firebaseAuth = auth;
    window.firebaseDB = db;

    console.log('Firebase initialized successfully!');
} catch (error) {
    console.error('Error in firebase-config.js:', error);
}