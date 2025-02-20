import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const apiKeySchema = z.object({
  sendGridApiKey: z
    .string()
    .min(1, "API key is required")
    .refine((key) => key.startsWith("SG."), "API key must start with 'SG.'"),
});

type ApiKeyFormData = z.infer<typeof apiKeySchema>;

interface ApiKeyStepProps {
  onComplete: () => void;
  defaultValue?: string;
}

export function ApiKeyStep({ onComplete, defaultValue }: ApiKeyStepProps) {
  const { toast } = useToast();
  const [showKey, setShowKey] = useState(false);

  const form = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      sendGridApiKey: defaultValue || "",
    },
  });

  const saveApiKey = useMutation({
    mutationFn: async (data: ApiKeyFormData) => {
      const res = await apiRequest("POST", "/api/settings", {
        sendGridApiKey: data.sendGridApiKey,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save API key");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "SendGrid API key saved successfully",
      });
      onComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
        <div className="p-2 bg-primary rounded-full">
          <Key className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h4 className="font-semibold">SendGrid API Key</h4>
          <p className="text-sm text-muted-foreground">
            Your API key can be found in your SendGrid dashboard under Settings → API Keys
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => saveApiKey.mutate(data))} className="space-y-4">
          <FormField
            control={form.control}
            name="sendGridApiKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>API Key</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      {...field}
                      type={showKey ? "text" : "password"}
                      placeholder="SG.xxxxxxxxxxxxxxxxxxxxxx"
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? "Hide" : "Show"}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={saveApiKey.isPending}
          >
            {saveApiKey.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save API Key"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
