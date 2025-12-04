// Application Controller - Coordinates authentication and data management
class AppController {
    constructor() {
        this.authService = window.authService;
        this.dbService = window.dbService;
        this.currentUser = null;
        this.currentTeamId = null;
    }

    async init() {
        // Wait for auth state to be determined
        this.authService.onAuthStateChanged = async (user) => {
            this.currentUser = user;

            if (user) {
                console.log('User logged in:', user.email);
                await this.loadUserTeam();
                await this.loadTeamData();
                this.startRealtimeListeners();
            } else {
                console.log('User logged out');
                this.currentTeamId = null;
            }
        };
    }

    async loadUserTeam() {
        // Get user's teams
        const teams = await this.dbService.getUserTeams();

        if (teams.length > 0) {
            // Load the first team (or previously selected team)
            const savedTeamId = localStorage.getItem('currentTeamId');
            const teamId = savedTeamId || teams[0].id;
            await this.dbService.setCurrentTeam(teamId);
            this.currentTeamId = teamId;
        } else {
            // No teams found - this shouldn't happen as auth-ui creates one
            console.warn('No teams found for user');
        }
    }

    async loadTeamData() {
        if (!this.currentTeamId) return;

        // Load team data from Firebase
        const teamData = await this.dbService.getTeamData(this.currentTeamId);

        if (teamData) {
            // Update application state with team data
            if (window.loadTeamDataToState) {
                window.loadTeamDataToState(teamData);
            }
        }
    }

    startRealtimeListeners() {
        if (!this.currentTeamId) return;

        // Listen for real-time updates to team data
        this.dbService.listenToTeamData((teamData) => {
            console.log('Team data updated in real-time');
            if (window.loadTeamDataToState) {
                window.loadTeamDataToState(teamData);
            }
        });
    }

    async saveState(stateData) {
        if (!this.currentTeamId) {
            console.warn('No current team selected');
            return;
        }

        // Save to Firebase instead of localStorage
        await this.dbService.saveRosterData(this.currentTeamId, stateData);
    }
}

// Initialize app controller
window.appController = new AppController();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.appController.init();
    });
} else {
    window.appController.init();
}
