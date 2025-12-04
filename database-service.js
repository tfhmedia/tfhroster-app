// Database Service for Firestore
class DatabaseService {
    constructor() {
        this.db = window.firebaseDB;
        this.currentTeamId = null;
        this.listeners = [];
    }

    // ===== TEAM OPERATIONS =====

    async createTeam(teamName) {
        try {
            const user = window.authService.getCurrentUser();
            if (!user) throw new Error('User not authenticated');

            const teamData = {
                name: teamName,
                createdBy: user.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                roles: [
                    { name: 'Main Camera', isMultiple: false, count: 1 },
                    { name: 'Second Camera', isMultiple: false, count: 1 },
                    { name: 'ProPresenter', isMultiple: false, count: 1 },
                    { name: 'Live Monitoring', isMultiple: false, count: 1 }
                ],
                settings: { allowDuplicates: false }
            };

            const teamRef = await this.db.collection('teams').add(teamData);

            // Add user as team lead
            await this.db.collection('teamLeads').add({
                userId: user.uid,
                teamId: teamRef.id,
                role: 'owner',
                addedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, teamId: teamRef.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getUserTeams() {
        try {
            const user = window.authService.getCurrentUser();
            if (!user) throw new Error('User not authenticated');

            // Get team IDs where user is a lead
            const leadsSnapshot = await this.db.collection('teamLeads')
                .where('userId', '==', user.uid)
                .get();

            const teamIds = leadsSnapshot.docs.map(doc => doc.data().teamId);

            if (teamIds.length === 0) return [];

            // Get team details
            const teamsSnapshot = await this.db.collection('teams')
                .where(firebase.firestore.FieldPath.documentId(), 'in', teamIds)
                .get();

            return teamsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error getting teams:', error);
            return [];
        }
    }

    async setCurrentTeam(teamId) {
        this.currentTeamId = teamId;
        localStorage.setItem('currentTeamId', teamId);
    }

    getCurrentTeamId() {
        if (!this.currentTeamId) {
            this.currentTeamId = localStorage.getItem('currentTeamId');
        }
        return this.currentTeamId;
    }

    // ===== TEAM MEMBERS OPERATIONS =====

    async addTeamMember(memberData) {
        try {
            const teamId = this.getCurrentTeamId();
            if (!teamId) throw new Error('No team selected');

            const docRef = await this.db.collection('teams').doc(teamId)
                .collection('members').add({
                    ...memberData,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            return { success: true, id: docRef.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateTeamMember(memberId, memberData) {
        try {
            const teamId = this.getCurrentTeamId();
            if (!teamId) throw new Error('No team selected');

            await this.db.collection('teams').doc(teamId)
                .collection('members').doc(memberId).update({
                    ...memberData,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async deleteTeamMember(memberId) {
        try {
            const teamId = this.getCurrentTeamId();
            if (!teamId) throw new Error('No team selected');

            await this.db.collection('teams').doc(teamId)
                .collection('members').doc(memberId).delete();

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getTeamMembers() {
        try {
            const teamId = this.getCurrentTeamId();
            if (!teamId) return [];

            const snapshot = await this.db.collection('teams').doc(teamId)
                .collection('members').get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Error getting members:', error);
            return [];
        }
    }

    // ===== ROSTER OPERATIONS =====

    async saveRoster(rosterData) {
        try {
            const teamId = this.getCurrentTeamId();
            if (!teamId) throw new Error('No team selected');

            await this.db.collection('teams').doc(teamId).update({
                roster: rosterData.roster,
                dates: rosterData.dates,
                unavailability: rosterData.unavailability || {},
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getRoster() {
        try {
            const teamId = this.getCurrentTeamId();
            if (!teamId) return null;

            const doc = await this.db.collection('teams').doc(teamId).get();
            if (!doc.exists) return null;

            const data = doc.data();
            return {
                roster: data.roster || {},
                dates: data.dates || [],
                unavailability: data.unavailability || {}
            };
        } catch (error) {
            console.error('Error getting roster:', error);
            return null;
        }
    }

    // ===== TEAM SETTINGS =====

    async updateTeamSettings(settings) {
        try {
            const teamId = this.getCurrentTeamId();
            if (!teamId) throw new Error('No team selected');

            await this.db.collection('teams').doc(teamId).update({
                settings: settings,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateTeamRoles(roles) {
        try {
            const teamId = this.getCurrentTeamId();
            if (!teamId) throw new Error('No team selected');

            await this.db.collection('teams').doc(teamId).update({
                roles: roles,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ===== REAL-TIME LISTENERS =====

    listenToTeamData(callback) {
        const teamId = this.getCurrentTeamId();
        if (!teamId) return null;

        const unsubscribe = this.db.collection('teams').doc(teamId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    callback(doc.data());
                }
            }, (error) => {
                console.error('Team listener error:', error);
            });

        this.listeners.push(unsubscribe);
        return unsubscribe;
    }

    listenToTeamMembers(callback) {
        const teamId = this.getCurrentTeamId();
        if (!teamId) return null;

        const unsubscribe = this.db.collection('teams').doc(teamId)
            .collection('members')
            .onSnapshot((snapshot) => {
                const members = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                callback(members);
            }, (error) => {
                console.error('Members listener error:', error);
            });

        this.listeners.push(unsubscribe);
        return unsubscribe;
    }

    // Clean up all listeners
    unsubscribeAll() {
        this.listeners.forEach(unsubscribe => unsubscribe());
        this.listeners = [];
    }
}

// Create singleton instance
window.dbService = new DatabaseService();
