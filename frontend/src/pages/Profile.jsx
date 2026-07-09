import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Mail, Settings } from "lucide-react";

const roleLabels = {
  admin: "Admin",
  compliance_manager: "Compliance Manager",
  reviewer: "Reviewer",
  document_owner: "Document Owner",
  auditor: "Auditor",
};

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground mt-1">Your account information</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 pb-4 border-b">
            <Avatar className="w-16 h-16 text-2xl">
              <AvatarFallback className="bg-primary/10 text-primary">{user?.name?.charAt(0)?.toUpperCase() || "?"}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{user?.name}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Mail className="w-3.5 h-3.5" />
                {user?.email}
              </div>
              <Badge variant="secondary" className="mt-1">{roleLabels[user?.role] || user?.role}</Badge>
            </div>
          </div>

          <div className="flex flex-col items-center py-6 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Manage your account settings, password, and preferences in Settings.
            </p>
            <Button onClick={() => navigate("/settings")} className="gap-2">
              <Settings className="size-4" />
              Open Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
