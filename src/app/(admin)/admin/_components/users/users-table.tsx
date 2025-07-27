"use client"

import { useState, useEffect } from "react"
import { DataTable } from "@/components/data-table"
import { columns } from "./columns"
import { getUsersAction } from "../../_actions/get-users.action"
import { useServerAction } from "zsa-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { PAGE_SIZE_OPTIONS } from "../../admin-constants"
export function UsersTable() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [emailFilter, setEmailFilter] = useState("")

  const { execute: fetchUsers, data, error, status } = useServerAction(getUsersAction, {
    onError: () => {
      toast.error("Failed to fetch users")
    },
  })

  useEffect(() => {
    fetchUsers({ page, pageSize, emailFilter })
  }, [fetchUsers, page, pageSize, emailFilter])

  const handlePageChange = (newPage: number) => {
    setPage(newPage + 1) // Convert from 0-based to 1-based
  }

  return (
    <div className="p-6 w-full min-w-0 flex flex-col overflow-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
        <h1 className="text-3xl font-bold">Users</h1>
        <Input
          placeholder="Filter emails..."
          type="search"
          value={emailFilter}
          onChange={(event) => setEmailFilter(event.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="mt-8 flex-1 min-h-0">
        <div className="space-y-4 h-full">
          {status === 'pending' || status === 'idle' ? (
            <div>Loading...</div>
          ) : error ? (
            <div>Error: Failed to fetch users</div>
          ) : !data ? (
            <div>No users found</div>
          ) : (
            <div className="w-full min-w-0">
              <DataTable
                columns={columns}
                data={data.users}
                pageCount={data.totalPages}
                pageIndex={page - 1}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={setPageSize}
                totalCount={data.totalCount}
                itemNameSingular="user"
                itemNamePlural="users"
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
