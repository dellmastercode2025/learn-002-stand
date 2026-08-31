import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';

const HomePage = lazy(() => import('./pages/HomePage'));
const CoursePage = lazy(() => import('./pages/CoursePage'));
const LessonPage = lazy(() => import('./pages/LessonPage'));
const SifatMapPage = lazy(() => import('./pages/SifatMapPage'));
const SifatDetailPage = lazy(() => import('./pages/SifatDetailPage'));
const AlphabetPage = lazy(() => import('./pages/AlphabetPage'));
const LetterDetailPage = lazy(() => import('./pages/LetterDetailPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const PracticePage = lazy(() => import('./pages/PracticePage'));
const QuizPage = lazy(() => import('./pages/QuizPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Загрузка">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-sage-200 border-t-sage-600" />
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/course" element={<CoursePage />} />
          <Route path="/course/:slug" element={<LessonPage />} />
          <Route path="/map" element={<SifatMapPage />} />
          <Route path="/sifat/:sifatId" element={<SifatDetailPage />} />
          <Route path="/letters" element={<AlphabetPage />} />
          <Route path="/letters/:letterId" element={<LetterDetailPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/quiz" element={<QuizPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
