import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, Home, LogOut, User } from "lucide-react";

export function Navigation() {
  const { user, logoutMutation } = useAuth();

  return (
    <nav className="bg-white border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/">
              <span className="text-xl font-bold text-primary cursor-pointer">Invoice Gen</span>
            </Link>

            <div className="hidden md:flex items-center space-x-4">
              <Link href="/">
                <span className="flex items-center space-x-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <Home className="h-4 w-4" />
                  <span>Dashboard</span>
                </span>
              </Link>
              <Link href="/create-invoice">
                <span className="flex items-center space-x-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <FileText className="h-4 w-4" />
                  <span>Create Invoice</span>
                </span>
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <span className="hidden md:inline-block text-sm text-muted-foreground">
              Welcome, {user?.username}
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => logoutMutation.mutate()}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}