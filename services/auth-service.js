// Authentication Service
class AuthService {
    constructor() {
        console.log('AuthService constructor called');
        this.auth = window.firebaseAuth;
        this.currentUser = null;

        // Listen for auth state changes
        if (this.auth) {
            this.auth.onAuthStateChanged((user) => {
                this.currentUser = user;
                this.onAuthStateChanged(user);
            });
        } else {
            console.error('AuthService: firebaseAuth is undefined!');
        }
    }

    // Override this method to handle auth state changes
    onAuthStateChanged(user) {
        if (user) {
            console.log('User logged in:', user.email);
        } else {
            console.log('User logged out');
        }
    }

    // Register new user
    async register(email, password, displayName) {
        try {
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);

            // Update profile with display name
            await userCredential.user.updateProfile({
                displayName: displayName
            });

            // Create user document in Firestore
            await window.firebaseDB.collection('users').doc(userCredential.user.uid).set({
                email: email,
                displayName: displayName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Login user
    async login(email, password) {
        try {
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Logout user
    async logout() {
        try {
            await this.auth.signOut();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Reset password
    async resetPassword(email) {
        try {
            await this.auth.sendPasswordResetEmail(email);
            return { success: true, message: 'Password reset email sent' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Check if user is logged in
    isLoggedIn() {
        return this.currentUser !== null;
    }
}

// Create singleton instance
try {
    console.log('Instantiating AuthService...');
    window.authService = new AuthService();
    console.log('AuthService instantiated successfully');
} catch (error) {
    console.error('Error instantiating AuthService:', error);
}
