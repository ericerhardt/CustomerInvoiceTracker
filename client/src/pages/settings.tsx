import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";
import { EmailConfigWizard } from "@/components/email-config-wizard";

const settingsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyAddress: z.string().min(1, "Company address is required"),
  companyEmail: z.string().email("Invalid email address"),
  stripeSecretKey: z.string().min(1, "Stripe secret key is required"),
  stripePublicKey: z.string().min(1, "Stripe public key is required"),
  taxRate: z.coerce
    .number()
    .min(0, "Tax rate cannot be negative")
    .max(100, "Tax rate cannot exceed 100%")
    .multipleOf(0.01, "Tax rate must have at most 2 decimal places"),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings");
      const data = await res.json();
      return data;
    },
  });

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      companyName: "",
      companyAddress: "",
      companyEmail: "",
      stripeSecretKey: "",
      stripePublicKey: "",
      taxRate: 10, // Default tax rate of 10%
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        companyName: settings.companyName || "",
        companyAddress: settings.companyAddress || "",
        companyEmail: settings.companyEmail || "",
        stripeSecretKey: settings.stripeSecretKey || "",
        stripePublicKey: settings.stripePublicKey || "",
        taxRate: Number(settings.taxRate) || 10,
      });
    }
  }, [settings, form]);

  const updateSettings = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      const res = await apiRequest("POST", "/api/settings", data);
      const responseData = await res.json();
      return responseData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Success",
        description: "Settings updated successfully",
      });
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
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>

        <Tabs defaultValue="company" className="space-y-6">
          <TabsList className="grid w-[400px] grid-cols-2">
            <TabsTrigger value="company">Company Information</TabsTrigger>
            <TabsTrigger value="email">Email Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="email">
            <EmailConfigWizard />
          </TabsContent>

          <TabsContent value="company">
            <Card>
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit((data) => updateSettings.mutate(data))}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="companyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="companyAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Address</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="companyEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="taxRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tax Rate (%)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="0" 
                              max="100" 
                              step="0.01" 
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormDescription>
                            Enter the tax rate percentage (0-100) with up to 2 decimal places (e.g., 8.25).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="stripeSecretKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stripe Secret Key</FormLabel>
                          <FormControl>
                            <Input {...field} type="password" />
                          </FormControl>
                          <FormDescription>
                            Your Stripe secret key (starts with "sk_")
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="stripePublicKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stripe Public Key</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription>
                            Your Stripe public key (starts with "pk_")
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" className="w-full" disabled={updateSettings.isPending}>
                      {updateSettings.isPending ? "Saving..." : "Save Settings"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}