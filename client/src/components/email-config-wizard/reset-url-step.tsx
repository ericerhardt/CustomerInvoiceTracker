import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Link } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const resetUrlSchema = z.object({
  resetLinkUrl: z.string().url("Please enter a valid URL"),
});

type ResetUrlFormData = z.infer<typeof resetUrlSchema>;

interface ResetUrlStepProps {
  onComplete: () => void;
  defaultValue?: string;
}

export function ResetUrlStep({ onComplete, defaultValue }: ResetUrlStepProps) {
  const { toast } = useToast();

  // Get existing settings first
  const { data: existingSettings } = useQuery({
    queryKey: ["/api/settings"],
  });

  const form = useForm<ResetUrlFormData>({
    resolver: zodResolver(resetUrlSchema),
    defaultValues: {
      resetLinkUrl: defaultValue || "http://localhost:5000/reset-password",
    },
  });

  const saveResetUrl = useMutation({
    mutationFn: async (data: ResetUrlFormData) => {
      console.log('Sending reset URL settings update:', data);

      // Merge with existing settings to prevent overwriting
      const updateData = {
        ...(existingSettings || {}),
        resetLinkUrl: data.resetLinkUrl,
      };

      const res = await apiRequest("POST", "/api/settings", updateData);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to save reset URL");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Reset URL saved successfully",
      });
      onComplete();
    },
    onError: (error: Error) => {
      console.error('Failed to save reset URL:', error);
      toast({
        title: "Error",
        description: error.message || "An unknown error occurred.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
        <div className="p-2 bg-primary rounded-full">
          <Link className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h4 className="font-semibold">Password Reset URL</h4>
          <p className="text-sm text-muted-foreground">
            Set the base URL for password reset links
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => saveResetUrl.mutate(data))} className="space-y-4">
          <FormField
            control={form.control}
            name="resetLinkUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reset Link URL</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="url"
                    placeholder="https://your-domain.com/reset-password"
                  />
                </FormControl>
                <FormDescription>
                  This URL will be used as the base for password reset links sent to users
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={saveResetUrl.isPending}
          >
            {saveResetUrl.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Reset URL"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
