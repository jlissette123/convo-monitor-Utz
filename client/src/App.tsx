import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { BrandProvider } from "@/components/BrandProvider";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { Queue } from "@/pages/Queue";
import { ReplyStudio } from "@/pages/ReplyStudio";
import { KnowledgeBase } from "@/pages/KnowledgeBase";
import { Notifications } from "@/pages/Notifications";
import { Analytics } from "@/pages/Analytics";
import { Settings } from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import PerplexityAttribution from "@/components/PerplexityAttribution";

function AppRoutes() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/queue" component={Queue} />
        <Route path="/studio" component={ReplyStudio} />
        <Route path="/knowledge" component={KnowledgeBase} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
      <PerplexityAttribution />
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrandProvider>
        <Router hook={useHashLocation}>
          <AppRoutes />
        </Router>
        <Toaster />
      </BrandProvider>
    </QueryClientProvider>
  );
}

export default App;
