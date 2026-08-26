import { createRouter, createWebHistory } from 'vue-router';
import WelcomeView from './views/WelcomeView.vue';
import PrepView from './views/PrepView.vue';
import LoginView from './views/LoginView.vue';
import StudentDetailView from './views/StudentDetailView.vue';
import TeacherView from './views/TeacherView.vue';
import AdminView from './views/AdminView.vue';
import ScreenView from './views/ScreenView.vue';
import SettingsView from './views/SettingsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/welcome', component: WelcomeView },
    { path: '/prep', component: PrepView },
    { path: '/login', component: LoginView },
    { path: '/students', redirect: '/login' },
    { path: '/students/:id', component: StudentDetailView },
    { path: '/teacher', component: TeacherView },
    { path: '/admin', component: AdminView },
    { path: '/screen', component: ScreenView },
    { path: '/settings', component: SettingsView },
  ],
});
