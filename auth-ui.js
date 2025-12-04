// Authentication UI Controller
console.log('auth-ui.js loaded (restored)');
class AuthUI {
    constructor() {
        console.log('AuthUI constructor start');
        this.authService = window.authService;
        console.log('AuthService in AuthUI:', this.authService);
        this.currentView = 'login'; // 'login' or 'signup'
        this.init();
        console.log('AuthUI constructor end');
    }

    init() {
        this.attachEventListeners();

        // Listen for auth state changes
        this.authService.onAuthStateChanged = (user) => {
            if (user) {
                this.hideAuthModal();
                this.showApp();
                this.updateUserDisplay(user);
            } else {
                this.showAuthModal();
                this.hideApp();
            }
        };
    }

    attachEventListeners() {
        // Form submissions
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        const signupForm = document.getElementById('signup-form');
        if (signupForm) {
            signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        }

        // View switching
        const showSignupBtn = document.getElementById('show-signup');
        if (showSignupBtn) {
            showSignupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSignup();
            });
        }

        const showLoginBtn = document.getElementById('show-login');
        if (showLoginBtn) {
            showLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showLogin();
            });
        }

        // Logout button (will be added to header later)
        document.addEventListener('click', (e) => {
            if (e.target.id === 'logout-button' || e.target.closest('#logout-button')) {
                this.handleLogout();
            }
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');

        if (errorEl) errorEl.classList.add('hidden');

        const result = await this.authService.login(email, password);

        if (result.success) {
            // Success - auth state listener will handle UI updates
            console.log('Login successful');
        } else {
            if (errorEl) {
                errorEl.textContent = result.error;
                errorEl.classList.remove('hidden');
            }
        }
    }

    async handleSignup(e) {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const errorEl = document.getElementById('signup-error');

        if (errorEl) errorEl.classList.add('hidden');

        const result = await this.authService.register(email, password, name);

        if (result.success) {
            // Success - auth state listener will handle UI updates
            console.log('Signup successful');
            // Create initial team for the user
            await this.createInitialTeam(name);
        } else {
            if (errorEl) {
                errorEl.textContent = result.error;
                errorEl.classList.remove('hidden');
            }
        }
    }

    async handleLogout() {
        await this.authService.logout();
        // Clean up
        if (window.dbService) {
            window.dbService.unsubscribeAll();
            window.dbService.currentTeamId = null;
        }
    }

    async createInitialTeam(userName) {
        const teamName = `${userName}'s Team`;
        if (window.dbService) {
            const result = await window.dbService.createTeam(teamName);
            if (result.success) {
                await window.dbService.setCurrentTeam(result.teamId);
            }
        }
    }

    showLogin() {
        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        const title = document.getElementById('auth-modal-title');

        if (loginForm) loginForm.classList.remove('hidden');
        if (signupForm) signupForm.classList.add('hidden');
        if (title) title.textContent = 'Sign In';

        this.currentView = 'login';
    }

    showSignup() {
        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        const title = document.getElementById('auth-modal-title');

        if (loginForm) loginForm.classList.add('hidden');
        if (signupForm) signupForm.classList.remove('hidden');
        if (title) title.textContent = 'Create Account';

        this.currentView = 'signup';
    }

    showAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal && !modal.open) {
            modal.showModal();
        }
    }

    hideAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal && modal.open) {
            modal.close();
        }
    }

    showApp() {
        const app = document.getElementById('app');
        if (app) app.classList.remove('hidden');
    }

    hideApp() {
        const app = document.getElementById('app');
        if (app) app.classList.add('hidden');
    }

    updateUserDisplay(user) {
        // Update header with user info
        const header = document.querySelector('header > div:first-child');
        if (!header) return;

        const displayName = user.displayName || user.email;

        // Check if user display already exists
        if (!document.getElementById('user-display')) {
            const userDisplayHTML = `
                <div id="user-display" class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-800">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                        ${displayName.substring(0, 2).toUpperCase()}
                    </div>
                    <div class="flex-1">
                        <p class="text-sm font-medium text-gray-300">${displayName}</p>
                        <p class="text-xs text-gray-500">${user.email}</p>
                    </div>
                    <button id="logout-button" class="text-xs text-gray-400 hover:text-white px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                        Logout
                    </button>
                </div>
            `;
            header.insertAdjacentHTML('beforeend', userDisplayHTML);
        }
    }
}

// Initialize authentication UI when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            console.log('Instantiating AuthUI (DOMContentLoaded)...');
            window.authUI = new AuthUI();
            console.log('AuthUI instantiated successfully (DOMContentLoaded)');
        } catch (error) {
            console.error('Error instantiating AuthUI (DOMContentLoaded):', error);
        }
    });
} else {
    try {
        console.log('Instantiating AuthUI...');
        window.authUI = new AuthUI();
        console.log('AuthUI instantiated successfully');
    } catch (error) {
        console.error('Error instantiating AuthUI:', error);
    }
}
