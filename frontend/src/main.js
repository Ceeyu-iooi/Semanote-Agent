import { createApp } from 'vue';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../docs/design/tokens.css';
import './style.css';
import App from './App.vue';
import DeveloperCenter from './components/DeveloperCenter.vue';

createApp(location.pathname.startsWith('/developer') ? DeveloperCenter : App).mount('#app');
