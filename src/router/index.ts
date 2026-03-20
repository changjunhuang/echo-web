import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/models',
  },
  {
    path: '/models',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      {
        path: '',
        name: 'Models',
        component: () => import('@/views/models/ModelsPage.vue'),
        meta: { title: '模型广场' },
      },
    ],
  },
  {
    path: '/chat',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      {
        path: '',
        name: 'Chat',
        component: () => import('@/views/chat/ChatPage.vue'),
        meta: { title: '智能对话' },
      },
    ],
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/admin/upload',
      },
      {
        path: 'upload',
        name: 'AdminUpload',
        component: () => import('@/views/admin/FileUploadPage.vue'),
        meta: { title: '文件管理' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/models',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const title = to.meta?.title as string | undefined
  document.title = title ? `${title} - Echo Web` : 'Echo Web'
})

export default router
